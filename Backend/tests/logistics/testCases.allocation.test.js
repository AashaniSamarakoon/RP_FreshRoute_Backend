"use strict";

jest.mock("../../Services/logisticsEngine/utils", () => {
  const actual = jest.requireActual("../../Services/logisticsEngine/utils");
  return { ...actual, getDrivingDistanceKm: jest.fn(), getRealWeather: jest.fn() };
});
jest.mock("../../Services/logisticsEngine/routeOptimizer", () => ({
  optimizeManifest: jest.fn(),
}));

const { getDrivingDistanceKm, getRealWeather } = require("../../Services/logisticsEngine/utils");
const { optimizeManifest } = require("../../Services/logisticsEngine/routeOptimizer");
const { runAllocationEngine } = require("../../Services/logisticsEngine/allocationEngine");

// ── Fruit specs ───────────────────────────────────────────────────────────────
const SPECS = {
  TJC: { force_refrigeration:true, max_safe_temp_c:25, min_safe_temp_c:12, optimal_temp_c:13, max_dist_uncooled_km:40, ethylene_producer:false, ethylene_sensitive:true },
  Ambul: { force_refrigeration:false, max_safe_temp_c:26, min_safe_temp_c:13, optimal_temp_c:14, max_dist_uncooled_km:60, ethylene_producer:true, ethylene_sensitive:false },
  All: { force_refrigeration:false, max_safe_temp_c:32, min_safe_temp_c:7, optimal_temp_c:10, max_dist_uncooled_km:150, ethylene_producer:false, ethylene_sensitive:false },
  Strawberry: { force_refrigeration:true, max_safe_temp_c:20, min_safe_temp_c:2, optimal_temp_c:4, max_dist_uncooled_km:25, ethylene_producer:false, ethylene_sensitive:true },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const makeOrder = (id, variant, qty, overrides = {}) => ({
  id, fruit_variant:variant, quantity:qty,
  pickup_lat:6.9271, pickup_lng:79.8612, drop_lat:7.2906, drop_lng:80.6337,
  pickup_location:"Colombo", drop_location:"Kandy",
  ...overrides,
});
const makeVehicle = (id, type, capacity, overrides = {}) => ({
  id, vehicle_type:type, capacity_kg:capacity,
  vehicle_license_plate:`TEST-${id}`,
  current_lat:5.9522, current_lng:80.5376,
  ...overrides,
});
const NOOP = () => {};

// Standard 2-stop manifest (40 min drive + 60 min service = 100 min/wave)
const SIMPLE_MANIFEST = [
  { type:"PICKUP", estimated_duration_mins:20, lat:6.9271, lng:79.8612 },
  { type:"DROP",   estimated_duration_mins:20, lat:7.2906, lng:80.6337 },
];
// Long manifest — drive 481 min + service 60 min = 541 min → minutes_worked > 480 → is_shift_over
const LONG_MANIFEST = [
  { type:"PICKUP", estimated_duration_mins:240, lat:7.2906, lng:80.6337 },
  { type:"DROP",   estimated_duration_mins:241, lat:5.9522, lng:80.5376 },
];

beforeEach(() => {
  getDrivingDistanceKm.mockResolvedValue({ distanceKm:30, durationMins:45, via:"mock" });
  getRealWeather.mockResolvedValue({ temp_c:22, raining:false, condition:"Clear" });
  optimizeManifest.mockResolvedValue(SIMPLE_MANIFEST);
});
afterEach(() => jest.clearAllMocks());

// ─────────────────────────────────────────────────────────────────────────────
describe("TC-LG-01 | Order Data Enrichment", () => {
  it("enriches each order with coordinates, weather, distance, and reqType before allocation", async () => {
    // ALL fruit, clear weather, 30 km (< 150 km limit) → enrichment yields UNCOVERED
    const result = await runAllocationEngine(
      [makeOrder("o1", "All", 800)],
      [makeVehicle("v1", "UNCOVERED", 4000)],
      { All: SPECS.All }, "2026-05-05", NOOP,
    );
    expect(result.scheduledJobs).toHaveLength(1);
    expect(result.scheduledJobs[0].vehicle_type_assigned).toBe("UNCOVERED");
    expect(result.overflowJobs).toHaveLength(0);
  });
});

describe("TC-LG-02 | Forced Refrigeration by Fruit Specification", () => {
  it("force_refrigeration=true assigns REFRIGERATED regardless of cool weather", async () => {
    getRealWeather.mockResolvedValue({ temp_c:15, raining:false, condition:"Cool" });
    const result = await runAllocationEngine(
      [makeOrder("o1", "Strawberry", 200)],
      [makeVehicle("v1", "REFRIGERATED", 2000)],
      { Strawberry: SPECS.Strawberry }, "2026-05-05", NOOP,
    );
    expect(result.scheduledJobs[0].vehicle_type_assigned).toBe("REFRIGERATED");
    expect(result.scheduledJobs[0].cooling_unit_on).toBe(true);
    expect(result.scheduledJobs[0].set_temperature_c).toBe(SPECS.Strawberry.optimal_temp_c);
  });
});

describe("TC-LG-03 | Weather-Forced Cooling", () => {
  it("31°C ambient temperature forces REFRIGERATED — larger UNCOVERED truck is not used", async () => {
    getRealWeather.mockResolvedValue({ temp_c:31, raining:false, condition:"Hot" });
    const result = await runAllocationEngine(
      [makeOrder("o1", "Ambul", 500)],
      [makeVehicle("v1", "REFRIGERATED", 2000), makeVehicle("v2", "UNCOVERED", 5000)],
      { Ambul: SPECS.Ambul }, "2026-05-05", NOOP,
    );
    expect(result.scheduledJobs[0].vehicle_type_assigned).toBe("REFRIGERATED");
    expect(result.scheduledJobs.find(j => j.vehicle_id === "v2")).toBeUndefined();
  });
});

describe("TC-LG-04 | Distance-Forced Cooling", () => {
  it("route 80 km > Ambul max_dist_uncooled 60 km forces REFRIGERATED in good weather", async () => {
    getDrivingDistanceKm.mockResolvedValue({ distanceKm:80, durationMins:120, via:"mock" });
    getRealWeather.mockResolvedValue({ temp_c:22, raining:false, condition:"Clear" });
    const result = await runAllocationEngine(
      [makeOrder("o1", "Ambul", 500)],
      [makeVehicle("v1", "REFRIGERATED", 2000)],
      { Ambul: SPECS.Ambul }, "2026-05-05", NOOP,
    );
    expect(result.scheduledJobs).toHaveLength(1);
    expect(result.scheduledJobs[0].vehicle_type_assigned).toBe("REFRIGERATED");
    expect(result.scheduledJobs[0].cooling_unit_on).toBe(true);
  });
});

describe("TC-LG-05 | Rain Protection Covered Vehicle Rule", () => {
  it("rain escalates requirement to COVERED; UNCOVERED truck is rejected to overflow", async () => {
    getRealWeather.mockResolvedValue({ temp_c:22, raining:true, condition:"Rain" });
    const result = await runAllocationEngine(
      [makeOrder("o1", "All", 500)],
      [makeVehicle("v1", "UNCOVERED", 4000)],
      { All: SPECS.All }, "2026-05-05", NOOP,
    );
    expect(result.scheduledJobs).toHaveLength(0);
    expect(result.overflowJobs).toHaveLength(1);
  });

  it("COVERED truck is assigned when rain requires enclosed protection", async () => {
    getRealWeather.mockResolvedValue({ temp_c:22, raining:true, condition:"Rain" });
    const result = await runAllocationEngine(
      [makeOrder("o2", "All", 500)],
      [makeVehicle("v2", "COVERED", 3000)],
      { All: SPECS.All }, "2026-05-05", NOOP,
    );
    expect(result.scheduledJobs[0].vehicle_type_assigned).toBe("COVERED");
  });
});

describe("TC-LG-06 | FFD Triage Sorting", () => {
  it("Strawberry (strictness=3) is sorted before ALL (strictness=1) — critical order secures REFRIGERATED slot", async () => {
    getRealWeather.mockResolvedValue({ temp_c:22, raining:false, condition:"Clear" });
    getDrivingDistanceKm.mockResolvedValue({ distanceKm:20, durationMins:30, via:"mock" });
    const result = await runAllocationEngine(
      [makeOrder("o1", "All", 1000), makeOrder("o2", "Strawberry", 200)],
      [makeVehicle("v1", "REFRIGERATED", 2000), makeVehicle("v2", "UNCOVERED", 4000)],
      { All: SPECS.All, Strawberry: SPECS.Strawberry }, "2026-05-05", NOOP,
    );
    expect(result.scheduledJobs).toHaveLength(2);
    expect(result.overflowJobs).toHaveLength(0);
    expect(result.scheduledJobs.find(j => j.vehicle_type_assigned === "REFRIGERATED")).toBeDefined();
  });
});

describe("TC-LG-07 | Vehicle Type Fit Gate", () => {
  it("REFRIGERATED orders use only refrigerated trucks — UNCOVERED truck is never assigned", async () => {
    getRealWeather.mockResolvedValue({ temp_c:31, raining:false, condition:"Hot" });
    const result = await runAllocationEngine(
      [makeOrder("o1", "TJC", 500), makeOrder("o2", "Ambul", 500)],
      [makeVehicle("v1", "REFRIGERATED", 2000), makeVehicle("v2", "REFRIGERATED", 2000), makeVehicle("v3", "UNCOVERED", 4000)],
      { TJC: SPECS.TJC, Ambul: SPECS.Ambul }, "2026-05-05", NOOP,
    );
    expect(result.scheduledJobs.every(j => j.vehicle_type_assigned === "REFRIGERATED")).toBe(true);
    expect(result.scheduledJobs.some(j => j.vehicle_id === "v3")).toBe(false);
  });
});

describe("TC-LG-08 | Covered Order Must Not Use Uncovered Truck", () => {
  it("rain-required COVERED order overflows when only UNCOVERED truck is available", async () => {
    getRealWeather.mockResolvedValue({ temp_c:22, raining:true, condition:"Rain" });
    getDrivingDistanceKm.mockResolvedValue({ distanceKm:20, durationMins:30, via:"mock" });
    const result = await runAllocationEngine(
      [makeOrder("o1", "All", 800)],
      [makeVehicle("v1", "UNCOVERED", 4000)],
      { All: SPECS.All }, "2026-05-05", NOOP,
    );
    expect(result.scheduledJobs).toHaveLength(0);
    expect(result.overflowJobs).toHaveLength(1);
    expect(result.overflowJobs[0].status).toBe("REQUIRES_ADMIN_ASSIGNMENT");
  });
});

describe("TC-LG-09 | Ethylene Producer/Sensitive Separation", () => {
  it("Ambul (producer) and TJC (sensitive) are placed on separate refrigerated trucks", async () => {
    getRealWeather.mockResolvedValue({ temp_c:31, raining:false, condition:"Hot" });
    const result = await runAllocationEngine(
      [makeOrder("o1", "Ambul", 500), makeOrder("o2", "TJC", 500)],
      [makeVehicle("v1", "REFRIGERATED", 2000), makeVehicle("v2", "REFRIGERATED", 2000)],
      { Ambul: SPECS.Ambul, TJC: SPECS.TJC }, "2026-05-05", NOOP,
    );
    expect(result.scheduledJobs).toHaveLength(2);
    expect(result.scheduledJobs[0].vehicle_id).not.toBe(result.scheduledJobs[1].vehicle_id);
  });
});

describe("TC-LG-10 | Reefer Operating Temperature Compatibility", () => {
  it("truck at 4°C for Strawberry rejects TJC (min_safe 12°C) — resolved in wave 2 at 13°C", async () => {
    getDrivingDistanceKm.mockResolvedValue({ distanceKm:20, durationMins:30, via:"mock" });
    const result = await runAllocationEngine(
      [makeOrder("o1", "Strawberry", 300), makeOrder("o2", "TJC", 300)],
      [makeVehicle("v1", "REFRIGERATED", 2000)],
      { Strawberry: SPECS.Strawberry, TJC: SPECS.TJC }, "2026-05-05", NOOP,
    );
    expect(result.scheduledJobs).toHaveLength(2);
    expect(result.wavesProcessed).toBe(2);
    expect(result.scheduledJobs.find(j => j.set_temperature_c === SPECS.Strawberry.optimal_temp_c)).toBeDefined();
    expect(result.scheduledJobs.find(j => j.set_temperature_c === SPECS.TJC.optimal_temp_c)).toBeDefined();
  });
});

describe("TC-LG-11 | Capacity Allocation and Order Splitting", () => {
  it("3000 kg order splits across a 2000 kg truck: 2000 in wave 1, 1000 in wave 2 — total conserved", async () => {
    const result = await runAllocationEngine(
      [makeOrder("o1", "All", 3000)],
      [makeVehicle("v1", "UNCOVERED", 2000)],
      { All: SPECS.All }, "2026-05-05", NOOP,
    );
    const total = result.scheduledJobs.reduce((s, j) => s + j.total_weight_kg, 0)
                + result.overflowJobs.reduce((s, j) => s + j.total_weight_kg, 0);
    expect(total).toBe(3000);
    expect(result.overflowJobs).toHaveLength(0);
    expect(result.wavesProcessed).toBe(2);
  });
});

describe("TC-LG-12 | Multi-Wave Capacity Reset", () => {
  it("truck capacity resets to full at each wave start — two 2000 kg orders fit on a single 2000 kg truck", async () => {
    const result = await runAllocationEngine(
      [makeOrder("o1", "All", 2000), makeOrder("o2", "All", 2000)],
      [makeVehicle("v1", "UNCOVERED", 2000)],
      { All: SPECS.All }, "2026-05-05", NOOP,
    );
    const totalAllocated = result.scheduledJobs.reduce((s, j) => s + j.total_weight_kg, 0);
    expect(totalAllocated).toBe(4000);
    expect(result.wavesProcessed).toBe(2);
    expect(result.overflowJobs).toHaveLength(0);
  });
});

describe("TC-LG-13 | Predictive Shift-Time Accumulator", () => {
  it("wave_est_minutes accumulator blocks order 2 in wave 1 (337+388=725 > 600); shift limit rejects in wave 2 → 3PL", async () => {
    // Order 1: Galle→Colombo (~184 km road, estTimeMins≈337) — fits alone
    // Order 2: Colombo→Anuradhapura (loaded leg ~219 km road, estTimeMins≈388) — blocked by accumulator
    // After wave 1 (100 min actual), wave 2 check: 100 + 573 est = 673 > 600 → overflow
    const result = await runAllocationEngine(
      [
        makeOrder("o1", "All", 500, { pickup_lat:6.0535, pickup_lng:80.2210, drop_lat:6.9271, drop_lng:79.8612 }),
        makeOrder("o2", "All", 500, { pickup_lat:6.9271, pickup_lng:79.8612, drop_lat:8.3352, drop_lng:80.4111 }),
      ],
      [makeVehicle("v1", "UNCOVERED", 4000, { current_lat:5.9522, current_lng:80.5376 })],
      { All: SPECS.All }, "2026-05-05", NOOP,
    );
    expect(result.scheduledJobs).toHaveLength(1);
    expect(result.overflowJobs).toHaveLength(1);
  });
});

describe("TC-LG-14 | Shift Exhaustion to 3PL Overflow", () => {
  it("actual trip time marks truck as shift-exhausted — subsequent orders are routed to 3PL", async () => {
    // LONG_MANIFEST: 481 drive + 60 service = 541 min → minutes_worked > 480 → is_shift_over = true
    optimizeManifest.mockResolvedValue(LONG_MANIFEST);
    const result = await runAllocationEngine(
      [
        makeOrder("o1", "All", 500, { pickup_lat:7.2906, pickup_lng:80.6337, drop_lat:5.9522, drop_lng:80.5376 }),
        makeOrder("o2", "All", 500, { pickup_lat:7.2906, pickup_lng:80.6337, drop_lat:5.9522, drop_lng:80.5376 }),
      ],
      [makeVehicle("v1", "UNCOVERED", 4000, { current_lat:6.9271, current_lng:79.8612 })],
      { All: SPECS.All }, "2026-05-05", NOOP,
    );
    expect(result.scheduledJobs).toHaveLength(1);
    expect(result.overflowJobs).toHaveLength(1);
    expect(result.overflowJobs[0].status).toBe("REQUIRES_ADMIN_ASSIGNMENT");
  });
});

describe("TC-LG-15 | Extreme Distance Full Rejection", () => {
  it("Jaffna→Hambantota single order exceeds 600-min shift limit — 100% sent to 3PL overflow", async () => {
    const result = await runAllocationEngine(
      [makeOrder("o1", "All", 1500, { pickup_lat:9.6615, pickup_lng:80.0255, drop_lat:6.1429, drop_lng:81.1212 })],
      [makeVehicle("v1", "UNCOVERED", 20000, { current_lat:9.6615, current_lng:80.0255 })],
      { All: SPECS.All }, "2026-05-05", NOOP,
    );
    expect(result.scheduledJobs).toHaveLength(0);
    expect(result.overflowJobs).toHaveLength(1);
    expect(result.overflowJobs[0].total_weight_kg).toBe(1500);
    expect(result.wavesProcessed).toBe(0);
  });
});

describe("TC-LG-16 | Scoring Prefers Exact Vehicle Type", () => {
  it("UNCOVERED truck (typeScore=100) beats overqualified REFRIGERATED (typeScore=10) for an UNCOVERED order", async () => {
    const result = await runAllocationEngine(
      [makeOrder("o1", "All", 500)],
      [makeVehicle("v-fridge", "REFRIGERATED", 2000), makeVehicle("v-open", "UNCOVERED", 2000)],
      { All: SPECS.All }, "2026-05-05", NOOP,
    );
    expect(result.scheduledJobs).toHaveLength(1);
    expect(result.scheduledJobs[0].vehicle_id).toBe("v-open");
  });
});

describe("TC-LG-17 | Scoring Uses Load Utilisation and Proximity", () => {
  it("vehicle at pickup location (emptyKm≈0, proxScore=100) wins over truck 95 km away (proxScore=0)", async () => {
    const result = await runAllocationEngine(
      [makeOrder("o1", "All", 800, { pickup_lat:6.9271, pickup_lng:79.8612, drop_lat:7.2906, drop_lng:80.6337 })],
      [
        makeVehicle("v-near", "UNCOVERED", 2000, { current_lat:6.9271, current_lng:79.8612 }),  // at Colombo = pickup
        makeVehicle("v-far",  "UNCOVERED", 2000, { current_lat:7.2906, current_lng:80.6337 }),  // at Kandy = 95 km away
      ],
      { All: SPECS.All }, "2026-05-05", NOOP,
    );
    expect(result.scheduledJobs).toHaveLength(1);
    expect(result.scheduledJobs[0].vehicle_id).toBe("v-near");
  });
});

describe("TC-LG-21 | 3PL Overflow Manifest Generation", () => {
  it("overflow job has REQUIRES_EXTERNAL_FLEET type, REQUIRES_ADMIN_ASSIGNMENT status, and a route manifest", async () => {
    const result = await runAllocationEngine(
      [makeOrder("o1", "TJC", 500)],
      [makeVehicle("v1", "UNCOVERED", 4000)],   // TJC needs REFRIGERATED — no fit
      { TJC: SPECS.TJC }, "2026-05-05", NOOP,
    );
    expect(result.overflowJobs).toHaveLength(1);
    expect(result.overflowJobs[0].vehicle_type_assigned).toBe("REQUIRES_EXTERNAL_FLEET");
    expect(result.overflowJobs[0].status).toBe("REQUIRES_ADMIN_ASSIGNMENT");
    expect(Array.isArray(result.overflowJobs[0].route_manifest)).toBe(true);
    expect(result.overflowJobs[0].route_manifest.length).toBeGreaterThan(0);
  });
});

describe("TC-LG-25 | Regression Harness All Scenarios", () => {
  it("Scenario A — single cold-chain order: TYPE and QTY constraints both pass", async () => {
    getRealWeather.mockResolvedValue({ temp_c:31, raining:false, condition:"Hot" });
    const result = await runAllocationEngine(
      [makeOrder("o1", "TJC", 800)],
      [makeVehicle("v1", "REFRIGERATED", 2000)],
      { TJC: SPECS.TJC }, "2026-05-05", NOOP,
    );
    expect(result.scheduledJobs[0].vehicle_type_assigned).toBe("REFRIGERATED");
    const qty = result.scheduledJobs.reduce((s, j) => s + j.total_weight_kg, 0)
              + result.overflowJobs.reduce((s, j) => s + j.total_weight_kg, 0);
    expect(qty).toBe(800);
  });

  it("Scenario B — ethylene conflict: producer and sensitive never share an enclosed truck", async () => {
    getRealWeather.mockResolvedValue({ temp_c:31, raining:false, condition:"Hot" });
    const result = await runAllocationEngine(
      [makeOrder("o1", "Ambul", 500), makeOrder("o2", "TJC", 500)],
      [makeVehicle("v1", "REFRIGERATED", 2000), makeVehicle("v2", "REFRIGERATED", 2000)],
      { Ambul: SPECS.Ambul, TJC: SPECS.TJC }, "2026-05-05", NOOP,
    );
    expect(result.scheduledJobs).toHaveLength(2);
    expect(result.scheduledJobs[0].vehicle_id).not.toBe(result.scheduledJobs[1].vehicle_id);
  });

  it("Scenario C — mixed fleet: quantity conservation holds across all order types", async () => {
    getRealWeather.mockResolvedValue({ temp_c:22, raining:false, condition:"Clear" });
    getDrivingDistanceKm.mockResolvedValue({ distanceKm:20, durationMins:30, via:"mock" });
    const orders = [makeOrder("o1", "All", 1000), makeOrder("o2", "All", 800)];
    const fleet  = [makeVehicle("v1", "UNCOVERED", 2000)];
    const result = await runAllocationEngine(orders, fleet, { All: SPECS.All }, "2026-05-05", NOOP);
    const totalOrdered   = orders.reduce((s, o) => s + o.quantity, 0);
    const totalAllocated = result.scheduledJobs.reduce((s, j) => s + j.total_weight_kg, 0)
                         + result.overflowJobs.reduce((s, j) => s + j.total_weight_kg, 0);
    expect(totalAllocated).toBe(totalOrdered);
  });
});
