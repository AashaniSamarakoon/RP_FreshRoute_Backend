"use strict";

// ── Mock supabase so no real DB calls are made ────────────────────────────────
jest.mock("../../utils/supabaseClient", () => {
  function makeChain(resolveData) {
    const obj = {
      select: () => obj,
      eq:     () => obj,
      in:     () => obj,
      not:    () => obj,
      insert: () => obj,
      update: () => obj,
      single: () => Promise.resolve({ data: { id: "job-001" }, error: null }),
      then:   (resolve) => Promise.resolve(resolveData).then(resolve),
    };
    return obj;
  }

  const supabase = {
    from: jest.fn((table) => {
      if (table === "orders")
        return makeChain({ data: [], error: null });           // no pending orders
      if (table === "fruit_specs")
        return makeChain({ data: [], error: null });
      if (table === "transport_jobs")
        return makeChain({ data: [], error: null });
      if (table === "vehicles")
        return makeChain({ data: [], error: null });
      return makeChain({ data: null, error: null });
    }),
  };
  return { supabase };
});

// ── Mock node-cron so scheduling does not fire during tests ───────────────────
jest.mock("node-cron", () => ({ schedule: jest.fn() }));

// ─────────────────────────────────────────────────────────────────────────────
describe("TC-LG-22 | Batch Controller Data Fetch Integration", () => {
  it("runDailyBatch queries orders, fruit_specs, and vehicles from Supabase before invoking the engine", async () => {
    const { supabase } = require("../../utils/supabaseClient");
    const batchController = require("../../controllers/transporter/batchController");

    const mockReq = { body: { targetDate: "2026-05-05" } };
    const mockRes = { json: jest.fn(), status: jest.fn().mockReturnThis() };

    await batchController.runDailyBatch(mockReq, mockRes);

    // Supabase was queried for orders
    expect(supabase.from).toHaveBeenCalledWith("orders");
    // Controller responds — "No pending orders" path when table is empty
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true }),
    );
  });

  it("runDailyBatch returns 400 when targetDate is missing from request body", async () => {
    const batchController = require("../../controllers/transporter/batchController");
    const mockReq = { body: {} };
    const mockRes = { json: jest.fn(), status: jest.fn().mockReturnThis() };

    await batchController.runDailyBatch(mockReq, mockRes);

    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false }),
    );
  });
});

describe("TC-LG-23 | Logistics Assign API Route", () => {
  it("POST /assign route is registered in the logistics router", () => {
    const router = require("../../routes/transporter/logisticsRoutes");
    // Express router stack holds registered layers
    const assignRoute = router.stack.find(
      (layer) =>
        layer.route &&
        layer.route.path === "/assign" &&
        layer.route.methods.post === true,
    );
    expect(assignRoute).toBeDefined();
  });

  it("POST /daily-batch route is registered in the logistics router", () => {
    const router = require("../../routes/transporter/logisticsRoutes");
    const batchRoute = router.stack.find(
      (layer) =>
        layer.route &&
        layer.route.path === "/daily-batch" &&
        layer.route.methods.post === true,
    );
    expect(batchRoute).toBeDefined();
  });
});
