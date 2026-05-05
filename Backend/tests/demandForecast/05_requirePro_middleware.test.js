describe("middleware/requirePro", () => {
  test("returns 402 when not pro", async () => {
    jest.resetModules();

    jest.doMock("../../Services/pro/subscriptionService", () => ({
      isProUser: jest.fn(async () => ({ isPro: false, subscription: null, error: null })),
    }));

    const requirePro = require("../../middleware/requirePro");

    const req = { user: { id: "u1" } };
    const res = {
      statusCode: 200,
      status: jest.fn(function (code) {
        this.statusCode = code;
        return this;
      }),
      json: jest.fn(function (payload) {
        this.body = payload;
        return this;
      }),
    };

    const next = jest.fn();

    await requirePro(req, res, next);

    expect(res.status).toHaveBeenCalledWith(402);
    expect(res.body.code).toBe("PRO_REQUIRED");
    expect(next).not.toHaveBeenCalled();
  });

  test("calls next when pro", async () => {
    jest.resetModules();

    jest.doMock("../../Services/pro/subscriptionService", () => ({
      isProUser: jest.fn(async () => ({
        isPro: true,
        subscription: { plan: "pro", status: "ACTIVE" },
        error: null,
      })),
    }));

    const requirePro = require("../../middleware/requirePro");

    const req = { user: { id: "u1" } };
    const res = {
      status: jest.fn(() => res),
      json: jest.fn(() => res),
    };
    const next = jest.fn();

    await requirePro(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});
