// scripts/setup-historical-prices-table.js
/**
 * One-time setup script to create historical_market_prices table in Supabase
 * Run this once: node scripts/setup-historical-prices-table.js
 */

require("dotenv").config();
const { supabase } = require("../supabaseClient");

async function setupHistoricalTable() {
  try {
    console.log("Setting up historical_market_prices table...");

    // Create table via SQL
    const { error } = await supabase.rpc("create_historical_table_if_not_exists");

    if (error) {
      console.warn("RPC method not available, attempting direct query...");
      // Fallback: Log instructions for manual setup
      console.log(`\n╔════════════════════════════════════════════════════════════╗`);
      console.log(`║  Please run this SQL in Supabase Dashboard manually:      ║`);
      console.log(`╚════════════════════════════════════════════════════════════╝\n`);

      const sql = `
CREATE TABLE IF NOT EXISTS historical_market_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fruit_id UUID REFERENCES fruits(id) ON DELETE SET NULL,
  fruit_name TEXT NOT NULL,
  variety TEXT,
  price_per_unit NUMERIC NOT NULL,
  unit TEXT DEFAULT 'kg',
  currency TEXT DEFAULT 'LKR',
  economic_center TEXT NOT NULL,
  source_url TEXT,
  captured_at TIMESTAMP WITH TIME ZONE NOT NULL,
  archived_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_historical_captured_at ON historical_market_prices(captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_historical_fruit ON historical_market_prices(fruit_id);
CREATE INDEX IF NOT EXISTS idx_historical_economic_center ON historical_market_prices(economic_center);
CREATE INDEX IF NOT EXISTS idx_historical_archived_at ON historical_market_prices(archived_at DESC);
      `;

      console.log(sql);
      console.log("\nAfter creating the table, run this command again.\n");
      return false;
    }

    console.log("✓ historical_market_prices table created successfully!");
    return true;
  } catch (err) {
    console.error("Error:", err.message);
    return false;
  }
}

setupHistoricalTable().then(success => {
  process.exit(success ? 0 : 1);
});
