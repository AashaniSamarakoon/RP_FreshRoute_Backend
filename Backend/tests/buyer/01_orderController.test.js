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
    delete: jest.fn(() => chain),
    eq: jest.fn(() => chain),
    in: jest.fn(() => chain),
    not: jest.fn(() => chain),
    order: jest.fn(() => chain),
    limit: jest.fn(() => chain),
    single: jest.fn(() => p),
  };
  chain.then = p.then.bind(p);
  chain.catch = p.catch.bind(p);
  chain.finally = p.finally.bind(p);
  return chain;
}

describe("buyer/orderController", () => {
  test("placeOrder returns 401 when user missing", async () => {
    jest.resetModules();

    const supabaseAdmin = { from: jest.fn() };
    jest.doMock("../../utils/supabaseClient", () => ({ supabaseAdmin }));
    jest.doMock("../../Services/matchingService", () => ({
      runMatchingAlgorithm: jest.fn(),
    }));
    jest.doMock("../../Services/blockchain/contractService", () => ({
      getContract: jest.fn(),
    }));
    jest.doMock("../../utils/blockchainUtils", () => ({ submitWithTx: jest.fn() }));
    jest.doMock("fs", () => ({ promises: { access: jest.fn() } }));

    const { placeOrder } = require("../../controllers/buyer/orderController");

    const req = { body: {} };
    const res = makeRes();

    await placeOrder(req, res);

    expect(res.statusCode).toBe(401);
    expect(res.body.message).toBe("Unauthorized");
  });

  test("placeOrder creates order and returns matches", async () => {
    jest.resetModules();

    const orderData = {
      id: 101,
      buyer_id: "u1",
      fruit_type: "Mango",
      variant: "Alphonso",
      quantity: 10,
      grade: "B",
      required_date: "2026-05-10",
      delivery_location: "Colombo",
      latitude: 6.9,
      longitude: 79.9,
      status: "OPEN",
    };

    const supabaseAdmin = {
      from: jest
        .fn()
        .mockImplementationOnce(() =>
          thenable({ data: { user_id: "u1" }, error: null }),
        )
        .mockImplementationOnce(() =>
          thenable({ data: orderData, error: null }),
        )
        .mockImplementationOnce(() =>
          thenable({ data: { blockchain_tx_id: [] }, error: null }),
        )
        .mockImplementationOnce(() => thenable({ data: null, error: null }))
        .mockImplementationOnce(() => thenable({ data: null, error: null })),
    };

    const runMatchingAlgorithm = jest
      .fn()
      .mockResolvedValue([{ proposal_id: "p1" }]);

    jest.doMock("../../utils/supabaseClient", () => ({ supabaseAdmin }));
    jest.doMock("../../Services/matchingService", () => ({ runMatchingAlgorithm }));
    jest.doMock("../../Services/blockchain/contractService", () => ({
      getContract: jest.fn().mockResolvedValue({
        contract: {},
        close: jest.fn(),
      }),
    }));
    jest.doMock("../../utils/blockchainUtils", () => ({
      submitWithTx: jest.fn().mockResolvedValue("tx1"),
    }));
    jest.doMock("fs", () => ({
      promises: { access: jest.fn().mockResolvedValue(undefined) },
    }));

    const { placeOrder } = require("../../controllers/buyer/orderController");

    const req = {
      user: { id: "u1" },
      body: {
        fruit_type: "Mango",
        variant: "Alphonso",
        quantity: 10,
        grade: "B",
        required_date: "2026-05-10",
        delivery_location: "Colombo",
        latitude: 6.9,
        longitude: 79.9,
      },
    };
    const res = makeRes();

    await placeOrder(req, res);

    expect(res.statusCode).toBe(201);
    expect(res.body.order.status).toBe("PENDING_BUYER");
    expect(res.body.matches).toHaveLength(1);
  });

  test("updateOrder rejects invalid quantity", async () => {
    jest.resetModules();

    const supabaseAdmin = { from: jest.fn() };

    jest.doMock("../../utils/supabaseClient", () => ({ supabaseAdmin }));
    jest.doMock("../../Services/blockchain/contractService", () => ({
      getContract: jest.fn(),
    }));
    jest.doMock("../../utils/blockchainUtils", () => ({ submitWithTx: jest.fn() }));
    jest.doMock("fs", () => ({
      promises: { access: jest.fn().mockResolvedValue(undefined) },
    }));

    const { updateOrder } = require("../../controllers/buyer/orderController");

    const req = {
      user: { id: "u1" },
      params: { orderId: "101" },
      body: { quantity: 0 },
    };
    const res = makeRes();

    await updateOrder(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe("Invalid quantity");
  });

  test("deleteOrder removes order and records tx", async () => {
    jest.resetModules();

    const supabaseAdmin = {
      from: jest
        .fn()
        .mockImplementationOnce(() =>
          thenable({ data: { buyer_id: "u1" }, error: null }),
        )
        .mockImplementationOnce(() => thenable({ data: null, error: null })),
    };

    jest.doMock("../../utils/supabaseClient", () => ({ supabaseAdmin }));
    jest.doMock("../../Services/blockchain/contractService", () => ({
      getContract: jest.fn().mockResolvedValue({
        contract: {},
        close: jest.fn(),
      }),
    }));
    jest.doMock("../../utils/blockchainUtils", () => ({
      submitWithTx: jest.fn().mockResolvedValue("tx2"),
    }));
    jest.doMock("fs", () => ({
      promises: { access: jest.fn().mockResolvedValue(undefined) },
    }));

    const { deleteOrder } = require("../../controllers/buyer/orderController");

    const req = { user: { id: "u1" }, params: { orderId: "101" } };
    const res = makeRes();

    await deleteOrder(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.blockchainTxId).toBe("tx2");
  });

  test("getMyOrders returns empty list", async () => {
    jest.resetModules();

    const supabaseAdmin = {
      from: jest
        .fn()
        .mockImplementationOnce(() =>
          thenable({ data: { user_id: "u1" }, error: null }),
        )
        .mockImplementationOnce(() => thenable({ data: [], error: null })),
    };

    jest.doMock("../../utils/supabaseClient", () => ({ supabaseAdmin }));

    const { getMyOrders } = require("../../controllers/buyer/orderController");

    const req = { user: { id: "u1" } };
    const res = makeRes();

    await getMyOrders(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.orders).toHaveLength(0);
    expect(res.body.totalOrders).toBe(0);
  });
});
