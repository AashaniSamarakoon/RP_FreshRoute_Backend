// Script to manually trigger Dambulla scraper
require("dotenv").config();
const { importDambullaPrices } = require("../Services/farmer/dambullaScraper");

async function runScraper() {
  try {
    console.log("🚀 Starting Dambulla scraper...\n");
    const result = await importDambullaPrices();
    console.log("\n✅ Scraper completed successfully!");
    console.log(`📊 Job ID: ${result.jobId}`);
    console.log(`📈 Records imported: ${result.recordsImported}`);
    process.exit(0);
  } catch (err) {
    console.error("\n❌ Scraper failed:", err.message);
    process.exit(1);
  }
}

runScraper();
