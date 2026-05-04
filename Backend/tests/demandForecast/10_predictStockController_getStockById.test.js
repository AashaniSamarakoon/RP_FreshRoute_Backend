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
    single: jest.fn(() => p),
  };
  chain.then = p.then.bind(p);
  chain.catch = p.catch.bind(p);
  chain.finally = p.finally.bind(p);
  return chain;
}

describe("farmer/predictStockController.getStockById", () => {
  test("returns stock with farmer user info when found", async () => {
    jest.resetModules();

    const stockRow = {
      id: "s1",
      farmer_id: "u1",
      farmer: { user_id: "u1" },
    };

    const userRow = { id: "u1", first_name: "A", last_name: "B" };

    const supabase = {
      from: jest.fn((table) => {
        if (table === "estimated_stock") return thenable({ data: stockRow, error: null });
        if (table === "users") return thenable({ data: userRow, error: null });
        return thenable({ data: null, error: null });
      }),
    };

    jest.doMock("../../utils/supabaseClient", () => ({ supabaseAdmin: supabase }));
    jest.doMock("../../Services/blockchain/contractService", () => ({ getContract: jest.fn() }));
    jest.doMock("../../Services/matchingService", () => ({ onNewStockAdded: jest.fn() }));
    jest.doMock("../../utils/uploadUtils", () => ({ uploadImageToSupabase: jest.fn() }));

    const { getStockById } = require("../../controllers/farmer/predictStockController");

    const req = { params: { stockId: "s1" } };
    const res = makeRes();

    await getStockById(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.stock).toBeTruthy();
    expect(res.body.stock.farmer.user).toEqual(userRow);
  });
});
