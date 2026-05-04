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
    lt: jest.fn(() => chain),
    ilike: jest.fn(() => chain),
    order: jest.fn(() => chain),
    limit: jest.fn(() => chain),
  };
  chain.then = p.then.bind(p);
  chain.catch = p.catch.bind(p);
  chain.finally = p.finally.bind(p);
  return chain;
}

describe("farmer/farmerController.getLiveMarketPrices", () => {
  test("maps economic_center_prices into frontend-friendly format", async () => {
    jest.resetModules();

    const today = new Date().toISOString().split("T")[0];

    const priceRows = [
      {
        fruit_id: "f1",
        fruit_name: "Mango",
        variety: "Karthakolomban",
        min_price: 100,
        max_price: 200,
        unit: "kg",
        captured_at: `${today}T06:00:00Z`,
        economic_center: "Dambulla",
      },
    ];

    const fruitImages = [{ id: "f1", name: "Mango", image_url: "https://img/mango.png" }];

    const supabase = {
      from: jest.fn((table) => {
        if (table === "economic_center_prices") return thenable({ data: priceRows, error: null });
        if (table === "fruits") return thenable({ data: fruitImages, error: null });
        return thenable({ data: [], error: null });
      }),
    };

    jest.doMock("../../utils/supabaseClient", () => ({ supabaseAdmin: supabase }));

    const { getLiveMarketPrices } = require("../../controllers/farmer/farmerController");

    const req = { query: { location: "Dambulla" } };
    const res = makeRes();

    await getLiveMarketPrices(req, res);

    expect(res.body.fruits).toHaveLength(1);
    expect(res.body.fruits[0].name).toBe("Mango");
    expect(res.body.fruits[0].price).toMatch(/Rs\./);
    expect(res.body.fruits[0].image).toBe("https://img/mango.png");
  });
});
