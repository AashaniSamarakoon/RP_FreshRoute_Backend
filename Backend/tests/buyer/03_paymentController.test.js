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

describe("buyer/paymentController", () => {
  test("releasePayment requires orderId", async () => {
    jest.resetModules();

    const supabaseAdmin = { from: jest.fn() };
    jest.doMock("../../utils/supabaseClient", () => ({ supabaseAdmin }));

    const { releasePayment } = require("../../controllers/buyer/paymentController");

    const req = { body: {} };
    const res = makeRes();

    await releasePayment(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe("Order ID is required");
  });

  test("releasePayment updates payment status", async () => {
    jest.resetModules();

    const payment = { id: "pay1", order_id: "o1", status: "AUTHORIZED", amount: 100 };

    const supabaseAdmin = {
      from: jest
        .fn()
        .mockImplementationOnce(() => thenable({ data: payment, error: null }))
        .mockImplementationOnce(() =>
          thenable({ data: { ...payment, status: "RELEASED" }, error: null }),
        )
        .mockImplementationOnce(() => thenable({ data: null, error: null })),
    };

    jest.doMock("../../utils/supabaseClient", () => ({ supabaseAdmin }));

    const { releasePayment } = require("../../controllers/buyer/paymentController");

    const req = { body: { orderId: "o1" } };
    const res = makeRes();

    await releasePayment(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.payment.status).toBe("RELEASED");
  });

  test("getPaymentStatus returns 404 when missing", async () => {
    jest.resetModules();

    const supabaseAdmin = {
      from: jest.fn(() => thenable({ data: null, error: { message: "missing" } })),
    };

    jest.doMock("../../utils/supabaseClient", () => ({ supabaseAdmin }));

    const { getPaymentStatus } = require("../../controllers/buyer/paymentController");

    const req = { params: { orderId: "o1" }, buyerId: "b1" };
    const res = makeRes();

    await getPaymentStatus(req, res);

    expect(res.statusCode).toBe(404);
    expect(res.body.message).toBe("Payment not found for this order");
  });
});
