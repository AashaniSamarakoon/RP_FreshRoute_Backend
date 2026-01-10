// services/dambullaScraper.js
const fetch = require("node-fetch").default || require("node-fetch");
const { supabase } = require("../../utils/supabaseClient");
const { alertEconomicCenterPriceUpdate } = require("../dataUpdateAlerts");
const { updateFreshRoutePricesOnEconomicChange } = require("./freshRoutePriceUpdater");

const DAMBULLA_URL = "https://dambulladec.com/home-dailyprice";
const ECONOMIC_CENTER = "Dambulla Dedicated Economic Centre";

// Use a deterministic captured_at timestamp for "today" to avoid duplicate inserts per day
function todayCapturedAtISO() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  // 06:00 local expressed in UTC to keep it roughly morning for reporting
  return new Date(`${y}-${m}-${d}T06:00:00.000Z`).toISOString();
}

async function getLatestPricesFallback(capturedAt, source = "live") {
  // Pull most recent price per fruit for this economic center and clone as today's entry
  // source can be "live" (from economic_center_prices) or "historical" (from historical_market_prices)
  const tableName = source === "historical" ? "historical_market_prices" : "economic_center_prices";
  
  const { data, error } = await supabase
    .from(tableName)
    .select("fruit_id, fruit_name, variety, min_price, max_price, unit, currency")
    .eq("economic_center", ECONOMIC_CENTER)
    .order("captured_at", { ascending: false })
    .limit(200);

  if (error) throw error;

  const latestByFruit = new Map();
  for (const row of data || []) {
    if (!latestByFruit.has(row.fruit_name)) {
      latestByFruit.set(row.fruit_name, row);
    }
  }

  const rows = Array.from(latestByFruit.values()).map(r => ({
    economic_center: ECONOMIC_CENTER,
    fruit_id: r.fruit_id,
    fruit_name: r.fruit_name,
    variety: r.variety,
    min_price: r.min_price || 0,
    max_price: r.max_price || 0,
    unit: r.unit,
    currency: r.currency || "LKR",
    source_url: `${DAMBULLA_URL} (fallback from ${source})`,
    captured_at: capturedAt,
  }));

  return rows;
}

// Parse price string to min/max/avg
function parsePriceRange(priceStr) {
  if (!priceStr) return null;
  const cleanPriceStr = priceStr.replace(/[^\d.\-\s]/g, "").trim();

  if (cleanPriceStr.includes("-")) {
    const parts = cleanPriceStr.split("-").map(p => parseFloat(p.trim()));
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      const minPrice = Math.min(parts[0], parts[1]);
      const maxPrice = Math.max(parts[0], parts[1]);
      return { minPrice, maxPrice, avgPrice: (minPrice + maxPrice) / 2 };
    }
  } else {
    const price = parseFloat(cleanPriceStr);
    if (!isNaN(price)) {
      return { minPrice: price, maxPrice: price, avgPrice: price };
    }
  }
  return null;
}

function buildPriceRecord({ fruitNameRaw, varietyRaw, priceStr, unitRaw }) {
  const fruitName = Object.entries(FRUIT_MAPPING).find(([key]) =>
    (fruitNameRaw || "").toLowerCase().includes(key)
  )?.[1];

  const parsed = parsePriceRange(priceStr);
  if (!fruitName || !parsed) return null;

  const { minPrice, maxPrice } = parsed;

  return {
    economic_center: ECONOMIC_CENTER,
    fruit_name: fruitName,
    variety: varietyRaw || null,
    min_price: minPrice,
    max_price: maxPrice,
    unit: unitRaw || "kg",
    currency: "LKR",
    source_url: DAMBULLA_URL,
    captured_at: new Date().toISOString(),
  };
}

async function scrapeDambullaWithPuppeteer() {
  const puppeteer = require("puppeteer");
  const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox", "--disable-setuid-sandbox"] });
  const page = await browser.newPage();
  await page.goto(DAMBULLA_URL, { waitUntil: "networkidle2", timeout: 30000 });
  await page.waitForSelector("table", { timeout: 15000 });

  const rows = await page.$$eval("table tbody tr, table tr", trs => trs.map(tr => {
    const cells = Array.from(tr.querySelectorAll("td")).map(td => td.innerText.trim());
    return cells;
  }));

  await browser.close();
  return rows.filter(r => r && r.length >= 3);
}

// Map fruit names from website to our DB
const FRUIT_MAPPING = {
  mango: "Mango",
  banana: "Banana",
  pineapple: "Pineapple",
};

/**
 * Scrape Dambulla prices using headless Puppeteer
 * Renders the React SPA, waits for table, extracts prices
 */
async function scrapeDambulla() {
  try {
    console.log(`[Dambulla Scraper] Starting headless scrape with Puppeteer...`);
    const rawRows = await scrapeDambullaWithPuppeteer();

    if (!rawRows || rawRows.length === 0) {
      console.warn("[Dambulla Scraper] No rows found in table.");
      return [];
    }

    const rows = [];
    for (const cells of rawRows) {
      if (cells.length < 3) continue;

      const fruitNameRaw = (cells[0] || "").toLowerCase();
      const varietyRaw = cells[1] || "";
      const priceStr = cells[2] || "";
      const unitRaw = cells.length > 3 ? cells[3] : "kg";

      const record = buildPriceRecord({ fruitNameRaw, varietyRaw, priceStr, unitRaw });
      if (record) {
        const parsed = parsePriceRange(priceStr);
        const { minPrice, maxPrice } = parsed;
        const avgPrice = (minPrice + maxPrice) / 2;
        const priceDisplay = minPrice === maxPrice 
          ? `Rs.${avgPrice}` 
          : `Rs.${minPrice}-${maxPrice}`;
        console.log(`[Dambulla] Parsed: ${record.fruit_name} @ ${priceDisplay}/${unitRaw}`);
        rows.push(record);
      }
    }

    if (rows.length === 0) {
      console.warn("[Dambulla] No valid rows parsed from Puppeteer output.");
    }

    return rows;
  } catch (err) {
    console.error(`[Dambulla Scraper] Error: ${err.message}`);
    throw err;
  }
}

async function importDambullaPrices() {
  const jobId = require("crypto").randomUUID();
  const startTime = new Date();
  const capturedAt = todayCapturedAtISO();
  let usedFallback = false;

  try {
    console.log(`[Dambulla Import Job ${jobId}] Starting`);

    // Log job start
    await supabase.from("scraping_jobs").insert({
      id: jobId,
      source_url: DAMBULLA_URL,
      economic_center: ECONOMIC_CENTER,
      status: "pending",
    });

    // Scrape data
    let rows = await scrapeDambulla();

    if (!rows || rows.length === 0) {
      console.warn("[Dambulla Import] No scraped rows. Checking for yesterday's prices...");
      
      // Get yesterday's date
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayDateStr = yesterday.toISOString().split("T")[0];
      
      // First try historical_market_prices table for yesterday's data
      console.log(`[Dambulla Import] Checking historical_market_prices for ${yesterdayDateStr}...`);
      const { data: historicalPrices, error: historicalError } = await supabase
        .from("historical_market_prices")
        .select("fruit_id, fruit_name, min_price, max_price")
        .gte("date", yesterdayDateStr)
        .lt("date", capturedAt.split("T")[0])
        .order("date", { ascending: false });
      
      if (!historicalError && historicalPrices && historicalPrices.length > 0) {
        console.log(`[Dambulla Import] Found ${historicalPrices.length} prices in historical_market_prices from ${yesterdayDateStr}`);
        
        // Group by fruit and take latest
        const latestByFruit = new Map();
        for (const row of historicalPrices) {
          if (!latestByFruit.has(row.fruit_name)) {
            latestByFruit.set(row.fruit_name, row);
          }
        }
        
        rows = Array.from(latestByFruit.values()).map(r => ({
          economic_center: ECONOMIC_CENTER,
          fruit_id: r.fruit_id,
          fruit_name: r.fruit_name,
          variety: null,
          min_price: r.min_price || 0,
          max_price: r.max_price || 0,
          unit: "kg",
          currency: "LKR",
          source_url: `${DAMBULLA_URL} (yesterday from historical_market_prices)`,
          captured_at: capturedAt,
        }));
        
        usedFallback = true;
      } else {
        // If no historical prices, try economic_center_prices for yesterday
        console.log(`[Dambulla Import] Checking economic_center_prices for ${yesterdayDateStr}...`);
        const { data: yesterdayPrices, error: yesterdayError } = await supabase
          .from("economic_center_prices")
          .select("fruit_id, fruit_name, variety, min_price, max_price, unit, currency")
          .eq("economic_center", ECONOMIC_CENTER)
          .gte("captured_at", yesterdayDateStr)
          .lt("captured_at", capturedAt.split("T")[0])
          .order("captured_at", { ascending: false });
        
        if (!yesterdayError && yesterdayPrices && yesterdayPrices.length > 0) {
          console.log(`[Dambulla Import] Found ${yesterdayPrices.length} prices from economic_center_prices (${yesterdayDateStr})`);
          
          // Group by fruit and take latest
          const latestByFruit = new Map();
          for (const row of yesterdayPrices) {
            if (!latestByFruit.has(row.fruit_name)) {
              latestByFruit.set(row.fruit_name, row);
            }
          }
          
          rows = Array.from(latestByFruit.values()).map(r => ({
            economic_center: ECONOMIC_CENTER,
            fruit_id: r.fruit_id,
            fruit_name: r.fruit_name,
            variety: r.variety,
            min_price: r.min_price || 0,
            max_price: r.max_price || 0,
            unit: r.unit,
            currency: r.currency || "LKR",
            source_url: `${DAMBULLA_URL} (yesterday from economic_center_prices)`,
            captured_at: capturedAt,
          }));
          
          usedFallback = true;
        } else {
          // If no yesterday prices, fall back to latest available
          console.warn("[Dambulla Import] No yesterday prices found. Using latest available prices.");
          rows = await getLatestPricesFallback(capturedAt, "live");
          usedFallback = true;
        }
      }
    }

    // If all fallbacks empty, try historical prices (any date)
    if (!rows || rows.length === 0) {
      console.warn("[Dambulla Import] No yesterday prices. Using latest historical prices as fallback.");
      rows = await getLatestPricesFallback(capturedAt, "historical");
      usedFallback = true;
    }

    if (!rows || rows.length === 0) {
      throw new Error("No Dambulla prices available (scrape + live fallback + historical fallback all empty)");
    }

    // Normalize captured_at to today's deterministic timestamp
    rows = rows.map(r => ({ ...r, captured_at: capturedAt }));

    // Get fruit IDs from DB
    const { data: fruits, error: fruitErr } = await supabase
      .from("fruits")
      .select("id, name");

    if (fruitErr) throw fruitErr;

    const fruitMap = Object.fromEntries(fruits.map(f => [f.name, f.id]));

    // Enrich rows with fruit_id
    const enrichedRows = rows.map(row => ({
      ...row,
      fruit_id: fruitMap[row.fruit_name] || null,
    }));

    // Remove any existing rows for today to avoid duplicates, then insert fresh set
    const todayDate = capturedAt.slice(0, 10);
    const { error: deleteErr } = await supabase
      .from("economic_center_prices")
      .delete()
      .eq("economic_center", ECONOMIC_CENTER)
      .eq("captured_at::date", todayDate);

    if (deleteErr) throw deleteErr;

    const { error: insertErr } = await supabase
      .from("economic_center_prices")
      .insert(enrichedRows);

    if (insertErr) throw insertErr;

    // Send alerts for each unique fruit
    const fruitsUpdated = new Map();
    enrichedRows.forEach(row => {
      if (!fruitsUpdated.has(row.fruit_name)) {
        fruitsUpdated.set(row.fruit_name, {
          fruit_id: row.fruit_id,
          fruit_name: row.fruit_name,
          min_price: row.min_price,
          max_price: row.max_price,
        });
      }
    });

    // Trigger alerts for each fruit (async, don't wait)
    for (const [fruitName, data] of fruitsUpdated.entries()) {
      try {
        alertEconomicCenterPriceUpdate(data).catch(err => 
          console.warn(`[Dambulla Alert] Failed to alert for ${fruitName}:`, err.message)
        );
      } catch (err) {
        console.warn(`[Dambulla Alert] Error triggering alert for ${fruitName}:`, err.message);
      }
    }

    console.log(`[Dambulla Alert] Triggered alerts for ${fruitsUpdated.size} fruits`);

    // Immediately update FreshRoute prices for each fruit with new economic center data
    console.log(`[FreshRoute Sync] Starting immediate price sync from economic center changes...`);
    const freshRouteSyncResults = [];
    for (const [fruitName, data] of fruitsUpdated.entries()) {
      try {
        const result = await updateFreshRoutePricesOnEconomicChange(
          data.fruit_id,
          fruitName
        );
        freshRouteSyncResults.push({ fruitName, ...result });
      } catch (err) {
        console.error(`[FreshRoute Sync] Error updating prices for ${fruitName}:`, err.message);
      }
    }

    let totalArchived = 0;
    let totalCreated = 0;
    freshRouteSyncResults.forEach(r => {
      totalArchived += r.archived || 0;
      totalCreated += r.created || 0;
    });

    if (totalArchived > 0 || totalCreated > 0) {
      console.log(`[FreshRoute Sync] ✓ Completed: Archived ${totalArchived} old prices, Created ${totalCreated} new prices`);
    }

    // Log success
    const completedAt = new Date();
    await supabase
      .from("scraping_jobs")
      .update({
        status: "success",
        records_imported: rows.length,
        completed_at: completedAt.toISOString(),
      })
      .eq("id", jobId);

    if (usedFallback) {
      console.warn(`[Dambulla Import Job ${jobId}] Fallback used - cloned latest prices as today's data.`);
    }

    console.log(
      `[Dambulla Import Job ${jobId}] Success: ${rows.length} records imported in ${
        (completedAt - startTime) / 1000
      }s`
    );

    return { jobId, recordsImported: rows.length };
  } catch (err) {
    console.error(`[Dambulla Import Job ${jobId}] Error: ${err.message}`);

    // Log failure
    try {
      await supabase
        .from("scraping_jobs")
        .update({
          status: "failed",
          error_message: err.message,
          completed_at: new Date().toISOString(),
        })
        .eq("id", jobId);
    } catch (logErr) {
      console.error("Failed to log error:", logErr.message);
    }

    throw err;
  }
}

module.exports = { scrapeDambulla, importDambullaPrices };
