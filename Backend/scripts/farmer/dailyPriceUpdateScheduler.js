/**
 * Scheduled Task: Daily FreshRoute Price Update
 * Runs daily at 6 AM to:
 * 1. Check for new economic center prices
 * 2. Calculate graded prices (A, B, C, D)
 * 3. Update freshroute_prices table
 * 4. Archive old records to history
 * 
 * Usage: Add to your cron job scheduler or call periodically from a task queue
 */

const { updateFreshRoutePrices } = require("../../Services/farmer/freshRoutePriceUpdater");

async function runDailyPriceUpdate() {
  try {
    console.log("[Scheduled] Starting daily FreshRoute price update...");
    const result = await updateFreshRoutePrices();
    console.log("[Scheduled] Daily price update completed:", result);
    return result;
  } catch (err) {
    console.error("[Scheduled] Error in daily price update:", err.message);
    throw err;
  }
}

/**
 * For Node.js cron job (using node-cron package):
 * const cron = require('node-cron');
 * // Run every day at 06:00 AM
 * cron.schedule('0 6 * * *', runDailyPriceUpdate);
 */

/**
 * For Express route (for manual trigger):
 * app.post('/admin/update-freshroute-prices', authenticate, async (req, res) => {
 *   try {
 *     const result = await runDailyPriceUpdate();
 *     res.json({ success: true, result });
 *   } catch (err) {
 *     res.status(500).json({ error: err.message });
 *   }
 * });
 */

module.exports = { runDailyPriceUpdate };
