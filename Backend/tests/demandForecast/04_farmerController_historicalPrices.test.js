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
    ilike: jest.fn(() => chain),
  };
  chain.then = p.then.bind(p);
  chain.catch = p.catch.bind(p);
  chain.finally = p.finally.bind(p);
  return chain;
}

describe("farmer/farmerController.getHistoricalPrices", () => {
  test("groups history into trends by fruit", async () => {
    jest.resetModules();

    const data = [
      {
        fruit_id: "f1",
        fruit_name: "Mango",
        variety: "Karthakolomban",
        min_price: 100,
        max_price: 200,
        unit: "kg",
        captured_at: "2026-05-01T06:00:00Z",
        economic_center: "Dambulla",
      },
      {
        fruit_id: "f1",
        fruit_name: "Mango",
        variety: "Karthakolomban",
        min_price: 120,
        max_price: 220,
        unit: "kg",
        captured_at: "2026-05-02T06:00:00Z",
        economic_center: "Dambulla",
      },
    ];

    const supabase = {
      from: jest.fn(() => thenable({ data, error: null })),
    };

    jest.doMock("../../utils/supabaseClient", () => ({ supabaseAdmin: supabase }));

    const { getHistoricalPrices } = require("../../controllers/farmer/farmerController");

    const req = { query: { days: "30", fruit: "Mango" } };
    const res = makeRes();

    await getHistoricalPrices(req, res);

    expect(res.body.trends).toHaveProperty("Mango");
    expect(res.body.trends.Mango).toHaveLength(2);
    expect(res.body.trends.Mango[0]).toHaveProperty("date");
    expect(res.body.trends.Mango[0]).toHaveProperty("price");
  });
});
