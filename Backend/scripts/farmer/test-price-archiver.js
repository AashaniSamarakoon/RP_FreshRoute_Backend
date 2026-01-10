// scripts/test-price-archiver.js
/**
 * Test script to manually trigger price archival
 * Usage: node scripts/test-price-archiver.js
 */

require("dotenv").config();
const { archiveOldPrices } = require("../../services/farmer/priceArchiver");

async function testArchive() {
  try {
    console.log("Testing price archival...\n");
    const result = await archiveOldPrices();
    console.log(`\n✓ Test successful: ${result.archivedCount} prices archived`);
    process.exit(0);
  } catch (err) {
    console.error("✗ Test failed:", err.message);
    process.exit(1);
  }
}

testArchive();
