// services/dambullaScheduler.js
const cron = require("node-cron");
const { importDambullaPrices } = require("./dambullaScraper");
const { archiveOldPrices } = require("./priceArchiver");

/**
 * Schedule automatic Dambulla price scraping + price archival
 * Scraping: daily at 6:00 AM Asia/Colombo time (UTC+5:30)
 * Archival: daily at 6:05 AM (after scraping completes)
 */
function startDambullaScheduler({ runOnStart = false } = {}) {
  // 6 AM Sri Lanka time = 0:30 UTC (approximately)
  // Cron format: minute hour day month day-of-week
  // 0 6 * * * = every day at 6:00 AM
  
  const job = cron.schedule("0 6 * * *", async () => {
    console.log("[Dambulla Scheduler] Running daily scrape...");
    try {
      const result = await importDambullaPrices();
      console.log(`[Dambulla Scheduler] Success: ${result.recordsImported} prices imported`);
    } catch (err) {
      console.error("[Dambulla Scheduler] Error:", err.message);
      // Don't throw - keep scheduler running
    }
  });

  console.log("[Dambulla Scheduler] Started - runs daily at 6:00 AM (Asia/Colombo)");

  // Schedule price archival 5 minutes after scraping (at 6:05 AM)
  const archiveJob = cron.schedule("5 6 * * *", async () => {
    console.log("[Price Archiver] Running daily archival...");
    try {
      const result = await archiveOldPrices();
      console.log(`[Price Archiver] Success: ${result.archivedCount} prices archived`);
    } catch (err) {
      console.error("[Price Archiver] Error:", err.message);
    }
  });

  console.log("[Price Archiver] Scheduled - runs daily at 6:05 AM (Asia/Colombo)");

  if (runOnStart) {
    // Check if today's prices already exist before importing
    (async () => {
      try {
        const { supabase } = require("../../utils/supabaseClient");
        const today = new Date().toISOString().slice(0, 10);
        const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
        
        const { data, error } = await supabase
          .from("economic_center_prices")
          .select("id")
          .gte("captured_at", `${today}T00:00:00Z`)
          .lt("captured_at", `${tomorrow}T00:00:00Z`)
          .limit(1);
        
        if (error) {
          console.error("[Dambulla Scheduler] Boot check error:", error.message);
          return;
        }
        
        if (data && data.length > 0) {
          console.log("[Dambulla Scheduler] Boot run skipped - today's prices already exist");
        } else {
          console.log("[Dambulla Scheduler] Boot run starting - no prices for today");
          const result = await importDambullaPrices();
          console.log(`[Dambulla Scheduler] Boot run imported ${result.recordsImported} prices`);
        }
        
        // Also run archival at boot to clean old prices
        const archiveResult = await archiveOldPrices();
        console.log(`[Price Archiver] Boot run archived ${archiveResult.archivedCount} prices`);
      } catch (err) {
        console.error("[Dambulla Scheduler] Boot run error:", err.message);
      }
    })();
  }

  return job;
}

/**
 * Optional: Run on demand for testing
 */
async function runDambullaNow() {
  console.log("[Dambulla Manual] Running scrape now...");
  try {
    const result = await importDambullaPrices();
    console.log(`[Dambulla Manual] Success: ${result.recordsImported} prices imported`);
    return result;
  } catch (err) {
    console.error("[Dambulla Manual] Error:", err.message);
    throw err;
  }
}

module.exports = { startDambullaScheduler, runDambullaNow };
