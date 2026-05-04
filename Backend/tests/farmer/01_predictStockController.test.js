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
    insert: jest.fn(() => chain),
    update: jest.fn(() => chain),
    eq: jest.fn(() => chain),
    single: jest.fn(() => p),
  };
  chain.then = p.then.bind(p);
  chain.catch = p.catch.bind(p);
  chain.finally = p.finally.bind(p);
  return chain;
}

describe("farmer/predictStockController.submitPredictStock", () => {
  test("returns 401 when user missing", async () => {
    jest.resetModules();

    const supabaseAdmin = { from: jest.fn() };

    jest.doMock("../../utils/supabaseClient", () => ({ supabaseAdmin }));
    jest.doMock("../../Services/blockchain/contractService", () => ({ getContract: jest.fn() }));
    jest.doMock("../../Services/matchingService", () => ({ onNewStockAdded: jest.fn() }));
    jest.doMock("../../utils/uploadUtils", () => ({ uploadImageToSupabase: jest.fn() }));
    jest.doMock("../../utils/blockchainUtils", () => ({ submitWithTx: jest.fn() }));
    jest.doMock("fs", () => ({ promises: { access: jest.fn() } }));

    const { submitPredictStock } = require("../../controllers/farmer/predictStockController");

    const req = { body: {} };
    const res = makeRes();

    await submitPredictStock(req, res);

    expect(res.statusCode).toBe(401);
    expect(res.body.message).toBe("Unauthorized");
  });

  test("returns 403 when wallet missing", async () => {
    jest.resetModules();

    const supabaseAdmin = { from: jest.fn() };

    jest.doMock("../../utils/supabaseClient", () => ({ supabaseAdmin }));
    jest.doMock("../../Services/blockchain/contractService", () => ({ getContract: jest.fn() }));
    jest.doMock("../../Services/matchingService", () => ({ onNewStockAdded: jest.fn() }));
    jest.doMock("../../utils/uploadUtils", () => ({ uploadImageToSupabase: jest.fn() }));
    jest.doMock("../../utils/blockchainUtils", () => ({ submitWithTx: jest.fn() }));
    jest.doMock("fs", () => ({ promises: { access: jest.fn().mockRejectedValue(new Error("missing")) } }));

    const { submitPredictStock } = require("../../controllers/farmer/predictStockController");

    const req = { user: { id: "u1" }, body: {} };
    const res = makeRes();

    await submitPredictStock(req, res);

    expect(res.statusCode).toBe(403);
    expect(res.body.message).toMatch(/Blockchain identity not found/i);
  });

  test("creates stock and triggers matching", async () => {
    jest.resetModules();

    let stockCalls = 0;
    const supabaseAdmin = {
      from: jest.fn((table) => {
        if (table === "farmers") {
          return thenable({ data: { user_id: "u1" }, error: null });
        }
        if (table === "estimated_stock") {
          stockCalls += 1;
          if (stockCalls === 1) {
            return thenable({ data: { id: "s1", blockchain_tx_id: [] }, error: null });
          }
          return thenable({ data: null, error: null });
        }
        return thenable({ data: null, error: null });
      }),
    };

    const onNewStockAdded = jest.fn().mockResolvedValue(undefined);

    jest.doMock("../../utils/supabaseClient", () => ({ supabaseAdmin }));
    jest.doMock("../../Services/blockchain/contractService", () => ({
      getContract: jest.fn().mockResolvedValue({
        contract: {},
        close: jest.fn(),
      }),
    }));
    jest.doMock("../../Services/matchingService", () => ({ onNewStockAdded }));
    jest.doMock("../../utils/uploadUtils", () => ({ uploadImageToSupabase: jest.fn() }));
    jest.doMock("../../utils/blockchainUtils", () => ({
      submitWithTx: jest.fn().mockResolvedValue("tx1"),
    }));
    jest.doMock("fs", () => ({ promises: { access: jest.fn().mockResolvedValue(undefined) } }));

    const { submitPredictStock } = require("../../controllers/farmer/predictStockController");

    const req = {
      user: { id: "u1" },
      body: {
        fruit_type: "Mango",
        variant: "Karthakolomban",
        quantity: "10",
        grade: "A",
        estimated_harvest_date: "2026-05-10",
        price_per_unit: "90",
      },
      files: [],
    };
    const res = makeRes();

    await submitPredictStock(req, res);

    expect(res.statusCode).toBe(201);
    expect(res.body.stock.id).toBe("s1");
    expect(res.body.blockchainStatus).toBe("Success");
    expect(onNewStockAdded).toHaveBeenCalledWith("s1");
  });
});
