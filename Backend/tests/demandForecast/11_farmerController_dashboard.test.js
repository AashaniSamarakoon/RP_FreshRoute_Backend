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
    gte: jest.fn(() => chain),
    order: jest.fn(() => chain),
    limit: jest.fn(() => chain),
    eq: jest.fn(() => chain),
    is: jest.fn(() => chain),
  };
  chain.then = p.then.bind(p);
  chain.catch = p.catch.bind(p);
  chain.finally = p.finally.bind(p);
  return chain;
}

describe("farmer/farmerController.getDashboard", () => {
  test("returns upcomingPickups and stats", async () => {
    jest.resetModules();

    const shipments = [
      { fruit: "Mango", target: "price", date: "2026-05-04", forecast_value: 100 },
      { fruit: "Mango", target: "price", date: "2026-05-05", forecast_value: 120 },
    ];

    let forecastsCalls = 0;
    const supabase = {
      from: jest.fn((table) => {
        if (table === "forecasts") {
          forecastsCalls += 1;
          if (forecastsCalls === 1) return thenable({ data: shipments, error: null });
          return thenable({ data: null, error: null, count: 7 });
        }
        if (table === "notifications") return thenable({ data: [{ id: 1 }], error: null });
        return thenable({ data: null, error: null });
      }),
    };

    jest.doMock("../../utils/supabaseClient", () => ({ supabaseAdmin: supabase }));

    const { getDashboard } = require("../../controllers/farmer/farmerController");

    const req = { user: { id: "u1" } };
    const res = makeRes();

    await getDashboard(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.upcomingPickups).toHaveLength(2);
    expect(res.body.stats.totalShipments).toBe(7);
  });
});
