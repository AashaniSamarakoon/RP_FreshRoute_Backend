"use strict";

const { calculateDistanceKm } = require("../../Services/logisticsEngine/utils");

describe("calculateDistanceKm", () => {
  it("returns 0 for the same point", () => {
    expect(calculateDistanceKm(6.9271, 79.8612, 6.9271, 79.8612)).toBe(0);
  });

  it("returns 0 when coordinates are null", () => {
    expect(calculateDistanceKm(null, null, null, null)).toBe(0);
  });

  it("calculates Colombo → Kandy within expected range", () => {
    // Straight-line distance is ~95 km
    const dist = calculateDistanceKm(6.9271, 79.8612, 7.2906, 80.6337);
    expect(dist).toBeGreaterThan(85);
    expect(dist).toBeLessThan(105);
  });

  it("calculates Matara → Colombo within expected range", () => {
    // Straight-line distance is ~132 km
    const dist = calculateDistanceKm(5.9522, 80.5376, 6.9271, 79.8612);
    expect(dist).toBeGreaterThan(120);
    expect(dist).toBeLessThan(145);
  });

  it("is symmetric — A→B equals B→A", () => {
    const ab = calculateDistanceKm(6.9271, 79.8612, 7.2906, 80.6337);
    const ba = calculateDistanceKm(7.2906, 80.6337, 6.9271, 79.8612);
    expect(ab).toBe(ba);
  });
});
