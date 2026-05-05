function makeRes() {
  const res = {};
  res.statusCode = 200;
  res.status = jest.fn((code) => {
    res.statusCode = code;
    return res;
  });
  res.json = jest.fn((payload) => {
    res.body = payload;
    return res;
  });
  return res;
}

function thenable(result) {
  const p = Promise.resolve(result);
  const chain = {
    select: jest.fn(() => chain),
    eq: jest.fn(() => chain),
    in: jest.fn(() => chain),
    or: jest.fn(() => chain),
    ilike: jest.fn(() => chain),
    gte: jest.fn(() => chain),
    lte: jest.fn(() => chain),
    lt: jest.fn(() => chain),
    order: jest.fn(() => chain),
    limit: jest.fn(() => chain),
    single: jest.fn(() => p),
    maybeSingle: jest.fn(() => p),
    update: jest.fn(() => chain),
    insert: jest.fn(() => p),
  };
  chain.then = p.then.bind(p);
  chain.catch = p.catch.bind(p);
  chain.finally = p.finally.bind(p);
  return chain;
}

describe("pro/proController.getPersonalMarketForecast", () => {
  test("returns series and hints for farmer crops", async () => {
    jest.resetModules();

    const farmersRow = { primary_crops: JSON.stringify(["Mango", "Banana"]), location: "Dambulla" };

    const forecastRows = [
      { fruit: "Mango", target: "price", date: "2026-05-01", forecast_value: 100 },
      { fruit: "Mango", target: "price", date: "2026-05-02", forecast_value: 120 },
      { fruit: "Banana", target: "price", date: "2026-05-01", forecast_value: 80 },
    ];

    const liveRows = [
      {
        fruit_name: "Mango",
        min_price: 90,
        max_price: 110,
        unit: "kg",
        captured_at: "2026-05-01T06:00:00Z",
        economic_center: "Dambulla",
      },
    ];

    const supabase = {
      from: jest.fn((table) => {
        if (table === "farmers") return thenable({ data: farmersRow, error: null });
        if (table === "forecasts") return thenable({ data: forecastRows, error: null });
        if (table === "economic_center_prices") return thenable({ data: liveRows, error: null });
        return thenable({ data: null, error: null });
      }),
    };

    jest.doMock("../../utils/supabaseClient", () => ({ supabaseAdmin: supabase }));

    const { getPersonalMarketForecast } = require("../../controllers/pro/proController");

    const req = {
      user: { id: "u1" },
      query: { days: "7", target: "price" },
      headers: {},
      get: () => "localhost:4000",
      protocol: "http",
    };
    const res = makeRes();

    await getPersonalMarketForecast(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.series).toHaveLength(2);
    expect(Array.isArray(res.body.hints)).toBe(true);
  });
});
