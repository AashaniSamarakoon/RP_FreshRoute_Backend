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

// Map fruit names from website to our DB
const FRUIT_MAPPING = {
  mango: "Mango",
  banana: "Banana",
  pineapple: "Pineapple",
};

/**
 * Scrape Dambulla prices from their website
 * Note: Website is React-based, so we attempt both direct fetch and API endpoints
 */
async function scrapeDambulla() {
  try {
    console.log(`[Dambulla Scraper] Starting scrape attempt...`);
    
    // Try fetching the page with JavaScript rendering (uses headless browser simulation)
    const res = await fetch(DAMBULLA_URL, { 
      timeout: 15000,
      headers: { 
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      }
    });

    if (!res.ok) {
      console.warn(`[Dambulla Scraper] HTTP ${res.status}: ${res.statusText}`);
      console.log(`[Dambulla Scraper] Note: Website is React-based (SPA). Use manual price insertion script.`);
      return [];
    }

    const html = await res.text();
    
    // Check if we got actual content or a SPA shell
    if (!html.includes('price') && !html.includes('table') && html.length < 5000) {
      console.warn("[Dambulla Scraper] Received SPA shell, not rendered HTML.");
      console.log("[Dambulla Scraper] To use live data, deploy scraper with headless browser (Puppeteer/Playwright)");
      console.log("[Dambulla Scraper] For now, use: node scripts/insert-prices.js");
      return [];
    }

    // Try to parse table if we got content
    const cheerio = require("cheerio");
    const $ = cheerio.load(html);
    const rows = [];

    // Look for price data in various formats
    $("table tbody tr, table tr").each((_, tr) => {
      const tds = $(tr).find("td");
      if (tds.length < 3) return;

      try {
        const fruitNameRaw = $(tds[0]).text().trim().toLowerCase();
        const varietyRaw = $(tds[1]).text().trim();
        const priceStr = $(tds[2]).text().trim();
        const unitRaw = tds.length > 3 ? $(tds[3]).text().trim() : "kg";

        // Parse price range (e.g., "100-150", "100 - 150", "Rs. 100-150")
        let minPrice, maxPrice, avgPrice;
        
        // Remove currency symbols and extract numbers
        const cleanPriceStr = priceStr.replace(/[^\d.\-\s]/g, "").trim();
        
        // Check if it's a range (contains dash)
        if (cleanPriceStr.includes("-")) {
          const parts = cleanPriceStr.split("-").map(p => parseFloat(p.trim()));
          if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
            minPrice = Math.min(parts[0], parts[1]);
            maxPrice = Math.max(parts[0], parts[1]);
            avgPrice = (minPrice + maxPrice) / 2;
          }
        } else {
          // Single price
          const price = parseFloat(cleanPriceStr);
          if (!isNaN(price)) {
            minPrice = maxPrice = avgPrice = price;
          }
        }

        const fruitName = Object.entries(FRUIT_MAPPING).find(([key]) =>
          fruitNameRaw.includes(key)
        )?.[1];

        if (!fruitName || avgPrice === undefined || Number.isNaN(avgPrice)) {
          return;
        }

        rows.push({
          economic_center: ECONOMIC_CENTER,
          fruit_name: fruitName,
          variety: varietyRaw || null,
          min_price: minPrice,
          max_price: maxPrice,
          unit: unitRaw || "kg",
          currency: "LKR",
          source_url: DAMBULLA_URL,
          captured_at: new Date().toISOString(),
        });

        const priceDisplay = minPrice === maxPrice 
          ? `Rs.${avgPrice}` 
          : `Rs.${minPrice}-${maxPrice} (avg: ${avgPrice})`;
        console.log(`[Dambulla] Parsed: ${fruitName} @ ${priceDisplay}/${unitRaw || 'kg'}`);
      } catch (e) {
        // silently skip parsing errors
      }
    });

    if (rows.length === 0) {
      console.warn("[Dambulla] No rows parsed. Website may be SPA-rendered only.");
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
      console.warn("[Dambulla Import] No scraped rows. Using yesterday's prices as today's fallback.");
      
      // Get yesterday's date
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayDateStr = yesterday.toISOString().split("T")[0];
      
      // Try to get yesterday's prices first
      const { data: yesterdayPrices, error: yesterdayError } = await supabase
        .from("economic_center_prices")
        .select("fruit_id, fruit_name, variety, min_price, max_price, unit, currency")
        .eq("economic_center", ECONOMIC_CENTER)
        .gte("captured_at", yesterdayDateStr)
        .lt("captured_at", capturedAt.split("T")[0])
        .order("captured_at", { ascending: false });
      
      if (!yesterdayError && yesterdayPrices && yesterdayPrices.length > 0) {
        console.log(`[Dambulla Import] Using ${yesterdayPrices.length} prices from yesterday (${yesterdayDateStr})`);
        
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
          source_url: `${DAMBULLA_URL} (yesterday's fallback)`,
          captured_at: capturedAt,
        }));
      } else {
        // If no yesterday prices, fall back to latest available
        console.warn("[Dambulla Import] No yesterday prices found. Using latest available prices.");
        rows = await getLatestPricesFallback(capturedAt, "live");
      }
      
      usedFallback = true;
    }

    // If live fallback empty, try historical prices
    if (!rows || rows.length === 0) {
      console.warn("[Dambulla Import] No live prices. Using historical prices as fallback.");
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
