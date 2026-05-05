"use strict";

jest.mock("../../Services/logisticsEngine/utils", () => {
  const actual = jest.requireActual("../../Services/logisticsEngine/utils");
  return {
    ...actual,
    getDrivingDistanceKm: jest.fn(),
    getRealWeather: jest.fn(),
  };
});

jest.mock("../../Services/logisticsEngine/routeOptimizer", () => ({
  optimizeManifest: jest.fn(),
}));

const { getDrivingDistanceKm, getRealWeather } = require("../../Services/logisticsEngine/utils");
const { optimizeManifest } = require("../../Services/logisticsEngine/routeOptimizer");
const { runAllocationEngine } = require("../../Services/logisticsEngine/allocationEngine");

// ── Fruit specs matching the real database ────────────────────────────────────

const SPECS = {
  TJC: {
    force_refrigeration: true,
    max_safe_temp_c: 25,
    min_safe_temp_c: 12,
    optimal_temp_c: 13,
    max_dist_uncooled_km: 40,
    ethylene_producer: false,
    ethylene_sensitive: true,
  },
  Ambul: {
    force_refrigeration: false,
    max_safe_temp_c: 26,
    min_safe_temp_c: 13,
    optimal_temp_c: 14,
    max_dist_uncooled_km: 60,
    ethylene_producer: true,
    ethylene_sensitive: false,
  },
  All: {
    force_refrigeration: false,
    max_safe_temp_c: 32,
    min_safe_temp_c: 7,
    optimal_temp_c: 10,
    max_dist_uncooled_km: 150,
    ethylene_producer: false,
    ethylene_sensitive: false,
  },
  Strawberry: {
    force_refrigeration: true,
    max_safe_temp_c: 20,
    min_safe_temp_c: 2,
    optimal_temp_c: 4,
    max_dist_uncooled_km: 25,
    ethylene_producer: false,
    ethylene_sensitive: true,
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const makeOrder = (id, variant, qty, overrides = {}) => ({
  id,
  fruit_variant: variant,
  quantity: qty,
  pickup_lat: 6.138,
  pickup_lng: 80.646,
  drop_lat: 5.975,
  drop_lng: 80.428,
  pickup_location: "Hakmana Estate",
  drop_location: "Weligama Market",
  ...overrides,
});

const makeVehicle = (id, type, capacity, overrides = {}) => ({
  id,
  vehicle_type: type,
  capacity_kg: capacity,
  vehicle_license_plate: `TEST-${id}`,
  current_lat: 5.9522,
  current_lng: 80.5376,
  ...overrides,
});

const NOOP = () => {};

// Simple manifest mock — 2 stops, 20 min each, ends at drop coords
const SIMPLE_MANIFEST = [
  { type: "PICKUP", estimated_duration_mins: 20, lat: 6.138, lng: 80.646 },
  { type: "DROP",   estimated_duration_mins: 20, lat: 5.975, lng: 80.428 },
];

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  getDrivingDistanceKm.mockResolvedValue({ distanceKm: 50, durationMins: 75, via: "mock" });
  getRealWeather.mockResolvedValue({ temp_c: 22, raining: false, condition: "Clear" });
  optimizeManifest.mockResolvedValue(SIMPLE_MANIFEST);
});

afterEach(() => jest.clearAllMocks());

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Vehicle type selection", () => {
  it("assigns REFRIGERATED to force_refrigeration fruit even in cool weather", async () => {
    getRealWeather.mockResolvedValue({ temp_c: 15, raining: false, condition: "Cool" });

    const result = await runAllocationEngine(
      [makeOrder("o1", "TJC", 500)],
      [makeVehicle("v1", "REFRIGERATED", 2000)],
      { TJC: SPECS.TJC },
      "2026-05-05",
      NOOP,
    );

    expect(result.scheduledJobs).toHaveLength(1);
    expect(result.scheduledJobs[0].vehicle_type_assigned).toBe("REFRIGERATED");
    expect(result.overflowJobs).toHaveLength(0);
  });

  it("assigns REFRIGERATED when temperature exceeds fruit safe limit", async () => {
    getRealWeather.mockResolvedValue({ temp_c: 31, raining: false, condition: "Hot" });

    const result = await runAllocationEngine(
      [makeOrder("o1", "Ambul", 500)],
      [makeVehicle("v1", "REFRIGERATED", 2000)],
      { Ambul: SPECS.Ambul },
      "2026-05-05",
      NOOP,
    );

    expect(result.scheduledJobs[0].vehicle_type_assigned).toBe("REFRIGERATED");
    expect(result.scheduledJobs[0].cooling_unit_on).toBe(true);
  });

  it("assigns UNCOVERED in cool weather for a hardy fruit", async () => {
    getRealWeather.mockResolvedValue({ temp_c: 22, raining: false, condition: "Clear" });

    const result = await runAllocationEngine(
      [makeOrder("o1", "All", 500)],
      [makeVehicle("v1", "UNCOVERED", 4000)],
      { All: SPECS.All },
      "2026-05-05",
      NOOP,
    );

    expect(result.scheduledJobs[0].vehicle_type_assigned).toBe("UNCOVERED");
    expect(result.scheduledJobs[0].cooling_unit_on).toBe(false);
  });

  it("rejects UNCOVERED vehicle for a REFRIGERATED order", async () => {
    getRealWeather.mockResolvedValue({ temp_c: 31, raining: false, condition: "Hot" });

    const result = await runAllocationEngine(
      [makeOrder("o1", "Ambul", 500)],
      [makeVehicle("v1", "UNCOVERED", 4000)], // only uncovered available
      { Ambul: SPECS.Ambul },
      "2026-05-05",
      NOOP,
    );

    expect(result.scheduledJobs).toHaveLength(0);
    expect(result.overflowJobs).toHaveLength(1);
  });
});

describe("Ethylene conflict", () => {
  it("places ethylene producer and sensitive on separate trucks", async () => {
    getRealWeather.mockResolvedValue({ temp_c: 31, raining: false, condition: "Hot" });
    optimizeManifest.mockResolvedValue(SIMPLE_MANIFEST);

    const orders = [
      makeOrder("o1", "Ambul", 500), // producer
      makeOrder("o2", "TJC",   500), // sensitive
    ];
    const fleet = [
      makeVehicle("v1", "REFRIGERATED", 2000),
      makeVehicle("v2", "REFRIGERATED", 2000),
    ];

    const result = await runAllocationEngine(
      orders, fleet, { Ambul: SPECS.Ambul, TJC: SPECS.TJC }, "2026-05-05", NOOP,
    );

    expect(result.scheduledJobs).toHaveLength(2);

    const job1 = result.scheduledJobs[0];
    const job2 = result.scheduledJobs[1];

    // Each job must be on a different vehicle
    expect(job1.vehicle_id).not.toBe(job2.vehicle_id);
  });

  it("resolves ethylene conflict via multi-wave — each order gets its own trip", async () => {
    getRealWeather.mockResolvedValue({ temp_c: 31, raining: false, condition: "Hot" });

    // 1 truck: TJC (sensitive) loads in wave 1 → has_ethylene_sensitive=true
    // Ambul (producer) is blocked in wave 1, allocated in wave 2 after truck resets
    const orders = [
      makeOrder("o1", "Ambul", 500),
      makeOrder("o2", "TJC",   500),
    ];
    const fleet = [makeVehicle("v1", "REFRIGERATED", 2000)];

    const result = await runAllocationEngine(
      orders, fleet, { Ambul: SPECS.Ambul, TJC: SPECS.TJC }, "2026-05-05", NOOP,
    );

    expect(result.scheduledJobs).toHaveLength(2);
    expect(result.overflowJobs).toHaveLength(0);
    // Both orders fully allocated across 2 separate waves
    expect(result.wavesProcessed).toBe(2);
  });
});

describe("Temperature conflict", () => {
  it("resolves temp conflict via multi-wave — each order gets its own reefer setting", async () => {
    getRealWeather.mockResolvedValue({ temp_c: 22, raining: false, condition: "Clear" });

    // Wave 1: Strawberry loads → reefer set to 4°C
    // TJC blocked in wave 1 (4°C < min_safe 12°C) → allocated wave 2 at 13°C
    const orders = [
      makeOrder("o1", "Strawberry", 300), // optimal 4°C
      makeOrder("o2", "TJC",        300), // min_safe 12°C — cannot share wave with strawberry
    ];
    const fleet = [makeVehicle("v1", "REFRIGERATED", 2000)];

    const result = await runAllocationEngine(
      orders, fleet, { Strawberry: SPECS.Strawberry, TJC: SPECS.TJC }, "2026-05-05", NOOP,
    );

    expect(result.scheduledJobs).toHaveLength(2);
    expect(result.overflowJobs).toHaveLength(0);
    expect(result.wavesProcessed).toBe(2);

    const strawberryJob = result.scheduledJobs.find((j) => j.set_temperature_c === 4);
    const tjcJob        = result.scheduledJobs.find((j) => j.set_temperature_c === 13);
    expect(strawberryJob).toBeDefined();
    expect(tjcJob).toBeDefined();
  });
});

describe("Shift time enforcement", () => {
  it("rejects all orders when route distance exceeds 600-minute shift limit", async () => {
    getRealWeather.mockResolvedValue({ temp_c: 22, raining: false, condition: "Clear" });

    // Jaffna → Hambantota: ~375 km straight line × 1.3 road factor = ~488 km
    // estTimeMins = round(488/40*60) + 60 = ~792 min > 600 → rejected
    const orders = [
      makeOrder("o1", "All", 500, {
        pickup_lat: 9.6615, pickup_lng: 80.0255,  // Jaffna
        drop_lat:   6.1429, drop_lng:   81.1212,  // Hambantota
      }),
    ];
    const fleet = [makeVehicle("v1", "UNCOVERED", 4000)];

    const result = await runAllocationEngine(
      orders, fleet, { All: SPECS.All }, "2026-05-05", NOOP,
    );

    expect(result.scheduledJobs).toHaveLength(0);
    expect(result.overflowJobs).toHaveLength(1);
    expect(result.wavesProcessed).toBe(0);
  });
});

describe("Quantity conservation", () => {
  it("allocated + overflow quantity always equals original order quantity", async () => {
    getRealWeather.mockResolvedValue({ temp_c: 22, raining: false, condition: "Clear" });

    // 3000 kg order, 2000 kg truck → 2000 allocated in wave 1, 1000 to overflow
    const orders = [makeOrder("o1", "All", 3000)];
    const fleet  = [makeVehicle("v1", "UNCOVERED", 2000)];

    const result = await runAllocationEngine(
      orders, fleet, { All: SPECS.All }, "2026-05-05", NOOP,
    );

    const allocated = result.scheduledJobs.reduce((sum, j) => sum + j.total_weight_kg, 0);
    const overflow  = result.overflowJobs.reduce((sum, j) => sum + j.total_weight_kg, 0);

    expect(allocated + overflow).toBe(3000);
  });

  it("routes 100% to 3PL when no suitable vehicle exists", async () => {
    getRealWeather.mockResolvedValue({ temp_c: 22, raining: false, condition: "Clear" });

    const result = await runAllocationEngine(
      [makeOrder("o1", "TJC", 500)],
      [makeVehicle("v1", "UNCOVERED", 4000)], // TJC needs REFRIGERATED
      { TJC: SPECS.TJC },
      "2026-05-05",
      NOOP,
    );

    expect(result.scheduledJobs).toHaveLength(0);
    expect(result.overflowJobs[0].total_weight_kg).toBe(500);
    expect(result.overflowJobs[0].status).toBe("REQUIRES_ADMIN_ASSIGNMENT");
  });
});

describe("FFD sort — strictest orders first", () => {
  it("allocates REFRIGERATED orders before UNCOVERED when fleet is limited", async () => {
    getRealWeather.mockResolvedValue({ temp_c: 31, raining: false, condition: "Hot" });

    // Only 1 refrigerated truck available — FFD must ensure TJC (critical) gets it
    const orders = [
      makeOrder("o1", "All",  1000), // UNCOVERED
      makeOrder("o2", "TJC",   800), // REFRIGERATED (force)
    ];
    const fleet = [
      makeVehicle("v1", "REFRIGERATED", 2000),
      makeVehicle("v2", "UNCOVERED",    4000),
    ];

    const result = await runAllocationEngine(
      orders, fleet, { All: SPECS.All, TJC: SPECS.TJC }, "2026-05-05", NOOP,
    );

    expect(result.scheduledJobs).toHaveLength(2);
    expect(result.overflowJobs).toHaveLength(0);

    const tjcJob = result.scheduledJobs.find((j) => j.vehicle_type_assigned === "REFRIGERATED");
    expect(tjcJob).toBeDefined();
  });
});
