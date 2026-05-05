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
  };
  chain.then = p.then.bind(p);
  chain.catch = p.catch.bind(p);
  chain.finally = p.finally.bind(p);
  chain.single = jest.fn(() => p);
  chain.maybeSingle = jest.fn(() => p);
  chain.limit = jest.fn(() => p);
  chain.order = jest.fn(() => chain);
  return chain;
}

describe("common/freshRoutePricesController.getFreshRoutePrices", () => {
  test("groups prices by fruit and includes grade descriptions", async () => {
    jest.resetModules();

    const today = new Date().toISOString().split("T")[0];
    const prices = [
      {
        fruit_id: "f1",
        fruit_name: "Mango",
        variety: "Karthakolomban",
        grade: "A",
        price: 220,
        source_min_price: 200,
        source_max_price: 215,
        updated_at: `${today}T06:00:00Z`,
      },
      {
        fruit_id: "f1",
        fruit_name: "Mango",
        variety: "Karthakolomban",
        grade: "B",
        price: 205,
        source_min_price: 200,
        source_max_price: 215,
        updated_at: `${today}T06:00:00Z`,
      },
    ];

    const fruitImages = [{ id: "f1", name: "Mango", image_url: "https://img/mango.png" }];

    const supabase = {
      from: jest.fn((table) => {
        if (table === "freshroute_prices") return thenable({ data: prices, error: null });
        if (table === "fruits") return thenable({ data: fruitImages, error: null });
        return thenable({ data: [], error: null });
      }),
    };

    jest.doMock("../../utils/supabaseClient", () => ({ supabase }));

    const { getFreshRoutePrices } = require("../../controllers/common/freshRoutePricesController");

    const req = {};
    const res = makeRes();

    await getFreshRoutePrices(req, res);

    expect(res.body.date).toBe(today);
    expect(res.body.fruits).toHaveLength(1);
    expect(res.body.fruits[0].grades.A.description).toMatch(/Premium/i);
    expect(res.body.fruits[0].image).toBe("https://img/mango.png");
  });
});
