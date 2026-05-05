"use strict";

jest.mock("../../Services/logisticsEngine/utils", () => {
  const actual = jest.requireActual("../../Services/logisticsEngine/utils");
  return {
    ...actual,
    getDrivingDistanceKm: jest.fn(),
    getRealWeather: jest.fn(),
  };
});

const { getDrivingDistanceKm } = require("../../Services/logisticsEngine/utils");
const { optimizeManifest } = require("../../Services/logisticsEngine/routeOptimizer");

const makeOrder = (id, pLat, pLng, dLat, dLng) => ({
  id,
  fruit_variant: "Pineapple",
  allocated_quantity: 500,
  pickup_location: "Farm",
  drop_location: "Market",
  _algo: { pLat, pLng, dLat, dLng },
});

beforeEach(() => {
  getDrivingDistanceKm.mockImplementation(async (lat1, lng1, lat2, lng2) => {
    const { calculateDistanceKm } = jest.requireActual(
      "../../Services/logisticsEngine/utils"
    );
    const dist = Math.round(calculateDistanceKm(lat1, lng1, lat2, lng2) * 1.3 * 10) / 10;
    return { distanceKm: dist, durationMins: Math.round((dist / 40) * 60) };
  });
});

afterEach(() => jest.clearAllMocks());

describe("optimizeManifest — sequence validity", () => {
  it("places PICKUP before DROP for a single order", async () => {
    const orders = [makeOrder("o1", 6.138, 80.646, 5.975, 80.428)];
    const manifest = await optimizeManifest(orders, 5.9522, 80.5376);

    const pickupIdx = manifest.findIndex((s) => s.type === "PICKUP" && s.order_id === "o1");
    const dropIdx   = manifest.findIndex((s) => s.type === "DROP"   && s.order_id === "o1");

    expect(pickupIdx).toBeLessThan(dropIdx);
  });

  it("places every PICKUP before its DROP across multiple orders", async () => {
    const orders = [
      makeOrder("o1", 6.138, 80.646, 5.975, 80.428),
      makeOrder("o2", 6.330, 80.565, 5.952, 80.538),
      makeOrder("o3", 6.068, 80.560, 5.948, 80.454),
    ];
    const manifest = await optimizeManifest(orders, 5.9522, 80.5376);

    for (const order of orders) {
      const pickupIdx = manifest.findIndex((s) => s.type === "PICKUP" && s.order_id === order.id);
      const dropIdx   = manifest.findIndex((s) => s.type === "DROP"   && s.order_id === order.id);
      expect(pickupIdx).toBeGreaterThanOrEqual(0);
      expect(dropIdx).toBeGreaterThanOrEqual(0);
      expect(pickupIdx).toBeLessThan(dropIdx);
    }
  });

  it("produces exactly 2 stops per order", async () => {
    const orders = [
      makeOrder("o1", 6.138, 80.646, 5.975, 80.428),
      makeOrder("o2", 6.283, 80.482, 5.955, 80.535),
    ];
    const manifest = await optimizeManifest(orders, 5.9522, 80.5376);
    expect(manifest).toHaveLength(orders.length * 2);
  });

  it("assigns sequential sequence numbers starting at 1", async () => {
    const orders = [makeOrder("o1", 6.138, 80.646, 5.975, 80.428)];
    const manifest = await optimizeManifest(orders, 5.9522, 80.5376);

    manifest.forEach((stop, idx) => {
      expect(stop.sequence).toBe(idx + 1);
    });
  });
});
