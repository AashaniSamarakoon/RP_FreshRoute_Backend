// services/dambullaScheduler.js
const cron = require("node-cron");
const { importDambullaPrices } = require("./dambullaScraper");

/**
 * Schedule automatic Dambulla price scraping
 * Runs daily at 6:00 AM Asia/Colombo time (UTC+5:30)
 */
function startDambullaScheduler() {
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
