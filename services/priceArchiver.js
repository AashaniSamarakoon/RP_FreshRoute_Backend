// services/priceArchiver.js
/**
 * Archive old market prices to historical table
 * Keeps economic_center_prices table with only current/live prices
 */

const { supabase } = require("../supabaseClient");

/**
 * Move prices older than today to historical_market_prices table
 */
async function archiveOldPrices() {
  try {
    const today = new Date().toISOString().slice(0, 10);
    console.log(`[Price Archiver] Starting archive for dates before ${today}...`);

    // 1) Get all prices from economic_center_prices that are older than today
    // Select only columns that exist in historical_market_prices table
    const { data: oldPrices, error: fetchErr } = await supabase
      .from("economic_center_prices")
      .select("id, fruit_id, fruit_name, variety, price_per_unit, unit, currency, economic_center, source_url, captured_at")
      .lt("captured_at::date", today);

    if (fetchErr) throw fetchErr;

    if (!oldPrices || oldPrices.length === 0) {
      console.log("[Price Archiver] No old prices to archive");
      return { archivedCount: 0 };
    }

    // 2) Insert into historical_market_prices with archived_at timestamp
    const archivedRecords = oldPrices.map(p => ({
      id: p.id,
      fruit_id: p.fruit_id,
      fruit_name: p.fruit_name,
      variety: p.variety,
      price_per_unit: p.price_per_unit,
      unit: p.unit,
      currency: p.currency,
      economic_center: p.economic_center,
      source_url: p.source_url,
      captured_at: p.captured_at,
      archived_at: new Date().toISOString(),
    }));

    const { error: insertErr } = await supabase
      .from("historical_market_prices")
      .insert(archivedRecords);

    if (insertErr) throw insertErr;

    console.log(`[Price Archiver] Inserted ${archivedRecords.length} records to historical table`);

    // 3) Delete from economic_center_prices (these are now archived)
    const oldPriceIds = oldPrices.map(p => p.id);
    
    const { error: deleteErr } = await supabase
      .from("economic_center_prices")
      .delete()
      .in("id", oldPriceIds);

    if (deleteErr) throw deleteErr;

    console.log(`[Price Archiver] Deleted ${oldPrices.length} old records from economic_center_prices`);

    return { archivedCount: oldPrices.length };
  } catch (err) {
    console.error("[Price Archiver] Error:", err.message);
    throw err;
  }
}

/**
 * Initialize historical_market_prices table if it doesn't exist
 * Note: This should be run once during setup
 */
async function initHistoricalTable() {
  try {
    console.log("[Price Archiver] Checking if historical_market_prices table exists...");
    
    const { error } = await supabase
      .from("historical_market_prices")
      .select("id")
      .limit(1);

    if (error && error.code === "42P01") {
      console.log("[Price Archiver] Table does not exist. Create it manually in Supabase with schema:");
      console.log(`
        CREATE TABLE historical_market_prices (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          fruit_id UUID REFERENCES fruits(id),
          fruit_name TEXT,
          variety TEXT,
          price_per_unit NUMERIC,
          unit TEXT,
          currency TEXT DEFAULT 'LKR',
          economic_center TEXT,
          source_url TEXT,
          captured_at TIMESTAMP WITH TIME ZONE,
          archived_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        CREATE INDEX idx_historical_captured_at ON historical_market_prices(captured_at);
        CREATE INDEX idx_historical_fruit ON historical_market_prices(fruit_id);
      `);
      return false;
    }

    console.log("[Price Archiver] historical_market_prices table is ready");
    return true;
  } catch (err) {
    console.error("[Price Archiver] Init error:", err.message);
    return false;
  }
}

module.exports = { archiveOldPrices, initHistoricalTable };
