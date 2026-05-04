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

describe("farmer/predictStockController.getStockById", () => {
  test("returns 400 when stockId missing", async () => {
    jest.resetModules();

    jest.doMock("../../utils/supabaseClient", () => ({
      supabaseAdmin: { from: jest.fn() },
    }));

    jest.doMock("../../Services/blockchain/contractService", () => ({ getContract: jest.fn() }));
    jest.doMock("../../Services/matchingService", () => ({ onNewStockAdded: jest.fn() }));
    jest.doMock("../../utils/uploadUtils", () => ({ uploadImageToSupabase: jest.fn() }));

    const { getStockById } = require("../../controllers/farmer/predictStockController");

    const req = { params: {} };
    const res = makeRes();

    await getStockById(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/Stock ID is required/i);
  });
});
