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
    ilike: jest.fn(() => chain),
    eq: jest.fn(() => chain),
    gte: jest.fn(() => chain),
    lte: jest.fn(() => chain),
    order: jest.fn(() => chain),
  };
  chain.then = p.then.bind(p);
  chain.catch = p.catch.bind(p);
  chain.finally = p.finally.bind(p);
  chain.single = jest.fn(() => p);
  chain.maybeSingle = jest.fn(() => p);
  chain.limit = jest.fn(() => p);
  return chain;
}

describe("common/forecastController.getForecast7Day", () => {
  test("computes trend up/down/stable", async () => {
    jest.resetModules();

    const rows = [
      { fruit: "Mango", target: "price", date: "2026-05-01", forecast_value: 100 },
      { fruit: "Mango", target: "price", date: "2026-05-02", forecast_value: 120 },
      { fruit: "Mango", target: "price", date: "2026-05-03", forecast_value: 110 },
    ];

    const supabase = {
      from: jest.fn(() => thenable({ data: rows, error: null })),
    };

    jest.doMock("../../utils/supabaseClient", () => ({ supabase }));

    const { getForecast7Day } = require("../../controllers/common/forecastController");

    const req = { query: { fruit: "Mango", target: "price" } };
    const res = makeRes();

    await getForecast7Day(req, res);

    expect(res.status).not.toHaveBeenCalledWith(500);
    expect(res.body.days).toHaveLength(3);
    expect(res.body.days[0].trend).toBe("stable");
    expect(res.body.days[1].trend).toBe("up");
    expect(res.body.days[2].trend).toBe("down");
  });
});
