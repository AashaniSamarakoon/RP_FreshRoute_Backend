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
    eq: jest.fn(() => chain),
    single: jest.fn(() => p),
  };
  chain.then = p.then.bind(p);
  chain.catch = p.catch.bind(p);
  chain.finally = p.finally.bind(p);
  return chain;
}

describe("farmer/farmerOrderController.updateOrderStatusReady", () => {
  test("returns 400 for invalid order status", async () => {
    jest.resetModules();

    const resultsQueue = [
      { data: { id: "o1", status: "OPEN", selected_farmer_id: "f1" }, error: null },
    ];

    const supabaseAdmin = {
      from: jest.fn(() => thenable(resultsQueue.shift() || { data: null, error: null })),
    };

    jest.doMock("../../utils/supabaseClient", () => ({ supabaseAdmin }));
    jest.doMock("../../Services/notificationsService", () => ({
      sendSystemNotification: jest.fn().mockResolvedValue(undefined),
    }));
    jest.doMock("../../utils/pricingUtils", () => ({
      fetchUnitPrice: jest.fn(),
      calculateFarmerPrice: jest.fn(),
    }));

    const { updateOrderStatusReady } = require("../../controllers/farmer/farmerOrderController");

    const req = { user: { id: "f1" }, params: { orderId: "o1" } };
    const res = makeRes();

    await updateOrderStatusReady(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/Expected PACKING or AUTHORIZED_PAYMENT/);
  });

  test("updates order to READY_FOR_PICKUP", async () => {
    jest.resetModules();

    const resultsQueue = [
      { data: { id: "o2", status: "AUTHORIZED_PAYMENT", selected_farmer_id: "f1" }, error: null },
      { data: [{ id: "o2", status: "READY_FOR_PICKUP" }], error: null },
      { data: { buyer_id: "b1" }, error: null },
    ];

    const supabaseAdmin = {
      from: jest.fn(() => thenable(resultsQueue.shift() || { data: null, error: null })),
    };

    jest.doMock("../../utils/supabaseClient", () => ({ supabaseAdmin }));
    jest.doMock("../../Services/notificationsService", () => ({
      sendSystemNotification: jest.fn().mockResolvedValue(undefined),
    }));
    jest.doMock("../../utils/pricingUtils", () => ({
      fetchUnitPrice: jest.fn(),
      calculateFarmerPrice: jest.fn(),
    }));

    const { updateOrderStatusReady } = require("../../controllers/farmer/farmerOrderController");

    const req = { user: { id: "f1" }, params: { orderId: "o2" } };
    const res = makeRes();

    await updateOrderStatusReady(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.updatedOrder.status).toBe("READY_FOR_PICKUP");
  });
});
