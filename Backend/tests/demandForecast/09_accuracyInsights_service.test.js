function thenable(result) {
  const p = Promise.resolve(result);
  const chain = {
    select: jest.fn(() => chain),
    gte: jest.fn(() => chain),
    lte: jest.fn(() => chain),
    in: jest.fn(() => chain),
    eq: jest.fn(() => chain),
    order: jest.fn(() => chain),
  };
  chain.then = p.then.bind(p);
  chain.catch = p.catch.bind(p);
  chain.finally = p.finally.bind(p);
  return chain;
}

describe("farmer/accuracyInsights.calculateAccuracyInsights", () => {
  test("computes overallAccuracy when matching forecast exists", async () => {
    jest.resetModules();

    const historical = [
      {
        id: 1,
        fruit_id: "f1",
        fruit_name: "Mango",
        min_price: 100,
        max_price: 200,
        captured_at: "2026-05-01T00:00:00Z",
        economic_center: "Dambulla",
      },
    ];

    const forecasts = [
      { fruit: "Mango", date: "2026-05-01", forecast_value: 150, target: "price" },
    ];

    const supabase = {
      from: jest.fn((table) => {
        if (table === "historical_market_prices") return thenable({ data: historical, error: null });
        if (table === "forecasts") return thenable({ data: forecasts, error: null });
        return thenable({ data: [], error: null });
      }),
    };

    jest.doMock("../../utils/supabaseClient", () => ({ supabase }));

    const { calculateAccuracyInsights } = require("../../Services/farmer/accuracyInsights");

    const result = await calculateAccuracyInsights();

    expect(result.summary.totalComparisons).toBe(1);
    expect(typeof result.summary.overallAccuracy).toBe("number");
  });
});
