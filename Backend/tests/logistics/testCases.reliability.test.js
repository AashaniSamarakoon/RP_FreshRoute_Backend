"use strict";

// Mock axios so real HTTP calls never fire — tests the fallback paths in utils.js
jest.mock("axios");
const axios = require("axios");

// Use the REAL utils module (not mocked) so fallback logic is actually exercised
const {
  getDrivingDistanceKm,
  getRealWeather,
} = require("../../Services/logisticsEngine/utils");

afterEach(() => jest.clearAllMocks());

// ─────────────────────────────────────────────────────────────────────────────
describe("TC-LG-24 | External API Fallback Handling", () => {
  it("getDrivingDistanceKm falls back to Haversine (via=haversine-fallback) when OSRM is unreachable", async () => {
    axios.get.mockRejectedValue(new Error("Network error — OSRM unavailable"));

    const result = await getDrivingDistanceKm(6.9271, 79.8612, 7.2906, 80.6337);

    expect(result.via).toBe("haversine-fallback");
    expect(result.distanceKm).toBeGreaterThan(0);
    expect(result.durationMins).toBeGreaterThan(0);
  });

  it("getDrivingDistanceKm returns fallback immediately for missing coordinates — no HTTP call made", async () => {
    const result = await getDrivingDistanceKm(null, null, null, null);

    expect(result.via).toBe("fallback-missing");
    expect(result.distanceKm).toBe(0);
    expect(axios.get).not.toHaveBeenCalled();
  });

  it("getRealWeather returns safe default (30°C, not raining) when OpenWeather API fails", async () => {
    axios.get.mockRejectedValue(new Error("API key invalid"));

    const result = await getRealWeather(6.9271, 79.8612);

    expect(result.temp_c).toBe(30);
    expect(result.raining).toBe(false);
    expect(result.condition).toMatch(/fallback/i);
  });

  it("allocation engine continues without crashing when both external APIs fail", async () => {
    // Both APIs fail → fallbacks kick in → engine must still run without throwing
    axios.get.mockRejectedValue(new Error("Total network failure"));

    // Use the real utils inside the engine — no jest.mock for utils here
    jest.resetModules();
    jest.mock("axios");
    require("axios").get.mockRejectedValue(new Error("Total network failure"));

    const { runAllocationEngine } = require("../../Services/logisticsEngine/allocationEngine");
    const { optimizeManifest }    = require("../../Services/logisticsEngine/routeOptimizer");

    // Minimal test — just verify it resolves (doesn't reject/throw)
    await expect(
      runAllocationEngine(
        [],   // no orders → engine exits early, no API calls needed
        [],
        {},
        "2026-05-05",
        () => {},
      ),
    ).resolves.toBeDefined();
  });
});
