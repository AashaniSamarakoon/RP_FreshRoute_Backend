"use strict";

jest.mock("../../Services/logisticsEngine/utils", () => {
  const actual = jest.requireActual("../../Services/logisticsEngine/utils");
  return { ...actual, getDrivingDistanceKm: jest.fn(), getRealWeather: jest.fn() };
});

const { getDrivingDistanceKm } = require("../../Services/logisticsEngine/utils");
const { optimizeManifest } = require("../../Services/logisticsEngine/routeOptimizer");

// ── Helpers ───────────────────────────────────────────────────────────────────
const makeOrder = (id, pLat, pLng, dLat, dLng) => ({
  id,
  fruit_variant: "All",
  allocated_quantity: 500,
  pickup_location: "Farm",
  drop_location: "Market",
  _algo: { pLat, pLng, dLat, dLng },
});

// Mock getDrivingDistanceKm using real Haversine (as the router does for optimisation)
beforeEach(() => {
  getDrivingDistanceKm.mockImplementation(async (lat1, lng1, lat2, lng2) => {
    const { calculateDistanceKm } = jest.requireActual("../../Services/logisticsEngine/utils");
    const dist = Math.round(calculateDistanceKm(lat1, lng1, lat2, lng2) * 1.3 * 10) / 10;
    return { distanceKm: dist, durationMins: Math.round((dist / 40) * 60) };
  });
});
afterEach(() => jest.clearAllMocks());

// ─────────────────────────────────────────────────────────────────────────────
describe("TC-LG-18 | Manifest Pickup-Before-Dropoff Constraint", () => {
  it("every PICKUP stop appears before its matching DROP stop in the manifest", async () => {
    const orders = [
      makeOrder("o1", 6.138, 80.646, 5.975, 80.428),
      makeOrder("o2", 6.330, 80.565, 5.952, 80.538),
      makeOrder("o3", 6.068, 80.560, 5.948, 80.454),
    ];
    const manifest = await optimizeManifest(orders, 5.9522, 80.5376);

    for (const order of orders) {
      const pickupIdx = manifest.findIndex(s => s.type === "PICKUP" && s.order_id === order.id);
      const dropIdx   = manifest.findIndex(s => s.type === "DROP"   && s.order_id === order.id);
      expect(pickupIdx).toBeGreaterThanOrEqual(0);
      expect(dropIdx).toBeGreaterThanOrEqual(0);
      expect(pickupIdx).toBeLessThan(dropIdx);
    }
  });
});

describe("TC-LG-19 | Nearest-Neighbour Manifest Construction", () => {
  it("manifest starts with the PICKUP nearest to the vehicle start position", async () => {
    // Vehicle at Matara (5.9522, 80.5376)
    // O-near pickup: Akuressa (6.1149, 80.4840) ≈ 19 km  — NEAREST
    // O-mid  pickup: Galle    (6.0535, 80.2210) ≈ 37 km
    // O-far  pickup: Colombo  (6.9271, 79.8612) ≈ 132 km
    const orders = [
      makeOrder("o-far",  6.9271, 79.8612, 5.9522, 80.5376),
      makeOrder("o-near", 6.1149, 80.4840, 5.9522, 80.5376),
      makeOrder("o-mid",  6.0535, 80.2210, 5.9522, 80.5376),
    ];
    const manifest = await optimizeManifest(orders, 5.9522, 80.5376);

    // First stop must be a PICKUP (not a DROP)
    expect(manifest[0].type).toBe("PICKUP");
    // First PICKUP should belong to the nearest order (o-near)
    expect(manifest[0].order_id).toBe("o-near");
  });
});

describe("TC-LG-20 | 2-Opt Route Refinement Maintains Legality", () => {
  it("after 2-opt refinement, every PICKUP still appears before its DROP — constraint is never violated", async () => {
    // Four orders with spread-out locations to maximise 2-opt swap opportunities
    const orders = [
      makeOrder("o1", 7.2906, 80.6337, 5.9522, 80.5376),  // Kandy → Matara
      makeOrder("o2", 6.9271, 79.8612, 6.0535, 80.2210),  // Colombo → Galle
      makeOrder("o3", 6.1149, 80.4840, 7.2906, 80.6337),  // Akuressa → Kandy
      makeOrder("o4", 6.0535, 80.2210, 6.9271, 79.8612),  // Galle → Colombo
    ];
    const manifest = await optimizeManifest(orders, 5.9522, 80.5376);

    expect(manifest).toHaveLength(orders.length * 2);
    for (const order of orders) {
      const pickupIdx = manifest.findIndex(s => s.type === "PICKUP" && s.order_id === order.id);
      const dropIdx   = manifest.findIndex(s => s.type === "DROP"   && s.order_id === order.id);
      expect(pickupIdx).toBeGreaterThanOrEqual(0);
      expect(dropIdx).toBeGreaterThanOrEqual(0);
      expect(pickupIdx).toBeLessThan(dropIdx);
    }
  });

  it("manifest sequence numbers are consecutive starting at 1 after 2-opt", async () => {
    const orders = [
      makeOrder("o1", 6.9271, 79.8612, 7.2906, 80.6337),
      makeOrder("o2", 6.0535, 80.2210, 5.9522, 80.5376),
    ];
    const manifest = await optimizeManifest(orders, 5.9522, 80.5376);
    manifest.forEach((stop, idx) => expect(stop.sequence).toBe(idx + 1));
  });
});
