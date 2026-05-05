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
    update: jest.fn(() => chain),
    insert: jest.fn(() => chain),
    eq: jest.fn(() => chain),
    single: jest.fn(() => p),
  };
  chain.then = p.then.bind(p);
  chain.catch = p.catch.bind(p);
  chain.finally = p.finally.bind(p);
  return chain;
}

describe("farmer/proposalController", () => {
  test("acceptProposal updates pricing and returns payment instructions", async () => {
    jest.resetModules();

    const future = new Date(Date.now() + 3600 * 1000).toISOString();

    const resultsQueue = [
      { data: { user_id: "f1" }, error: null },
      {
        data: {
          id: "p1",
          order_id: "o1",
          stock_id: "s1",
          quantity_proposed: 5,
          expires_at: future,
          stock: { farmer_id: "f1" },
          order: { id: "o1" },
        },
        error: null,
      },
      { data: { id: "s1", quantity: 10 }, error: null },
      {
        data: {
          id: "o1",
          fruit_type: "Mango",
          variant: "Karthakolomban",
          grade: "A",
          latitude: 6.9,
          longitude: 79.9,
        },
        error: null,
      },
      { data: { latitude: 6.9, longitude: 79.9 }, error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: { buyer_id: "b1" }, error: null },
    ];

    const supabaseAdmin = {
      from: jest.fn(() => thenable(resultsQueue.shift() || { data: null, error: null })),
    };

    jest.doMock("../../utils/supabaseClient", () => ({ supabaseAdmin }));
    jest.doMock("../../utils/logisticsUtils", () => ({
      calculateDistanceKm: jest.fn().mockReturnValue(10),
    }));
    jest.doMock("../../utils/pricingUtils", () => ({
      fetchUnitPrice: jest.fn().mockResolvedValue(100),
      calculatePrice: jest.fn().mockReturnValue({
        totalPrice: 1000,
        basePrice: 900,
        serviceCharge: 50,
        deliveryFee: 50,
      }),
      calculateFarmerPrice: jest.fn(),
    }));
    jest.doMock("../../Services/blockchain/contractService", () => ({
      getContract: jest.fn().mockRejectedValue(new Error("ledger down")),
    }));
    jest.doMock("../../Services/notificationsService", () => ({
      sendSystemNotification: jest.fn().mockResolvedValue(undefined),
    }));

    const { acceptProposal } = require("../../controllers/farmer/proposalController");

    const req = { user: { id: "f1" }, params: { proposalId: "p1" } };
    const res = makeRes();

    await acceptProposal(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.requiresPayment).toBe(true);
    expect(res.body.totalAmount).toBe(1000);
    expect(res.body.blockchainStatus).toBe("Failed");
  });

  test("rejectProposal returns success message", async () => {
    jest.resetModules();

    const resultsQueue = [
      { data: { user_id: "f1" }, error: null },
      {
        data: { id: "p2", order_id: "o2", stock: { farmer_id: "f1" } },
        error: null,
      },
      { data: null, error: null },
      { data: { buyer_id: "b1" }, error: null },
    ];

    const supabaseAdmin = {
      from: jest.fn(() => thenable(resultsQueue.shift() || { data: null, error: null })),
    };

    jest.doMock("../../utils/supabaseClient", () => ({ supabaseAdmin }));
    jest.doMock("../../Services/notificationsService", () => ({
      sendSystemNotification: jest.fn().mockResolvedValue(undefined),
    }));

    const { rejectProposal } = require("../../controllers/farmer/proposalController");

    const req = { user: { id: "f1" }, params: { proposalId: "p2" } };
    const res = makeRes();

    await rejectProposal(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toMatch(/Proposal rejected/i);
  });
});
