const { updateFreshRoutePrices, initializeTodaysPrices } = require("../../Services/farmer/freshRoutePriceUpdater");

/**
 * TEST ENDPOINTS FOR FRESHROUTE PRICING SYSTEM
 * WARNING: These are admin/test endpoints and should be protected/removed in production
 */

/**
 * Manually trigger the daily FreshRoute price update
 * GET /api/admin/test/freshroute/update
 */
async function testUpdateFreshRoutePrices(req, res) {
  try {
    console.log("[TEST] Manual trigger of FreshRoute price update");
    const result = await updateFreshRoutePrices();
    res.json({
      status: "success",
      message: "FreshRoute prices updated successfully",
      result,
    });
  } catch (error) {
    console.error("[TEST] Error updating prices:", error);
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
}

/**
 * Manually trigger initialization of today's prices
 * GET /api/admin/test/freshroute/initialize
 */
async function testInitializePrices(req, res) {
  try {
    console.log("[TEST] Manual trigger of FreshRoute price initialization");
    const result = await initializeTodaysPrices();
    res.json({
      status: "success",
      message: "FreshRoute prices initialized successfully",
      result,
    });
  } catch (error) {
    console.error("[TEST] Error initializing prices:", error);
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
}

module.exports = {
  testUpdateFreshRoutePrices,
  testInitializePrices,
};
