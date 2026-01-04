// services/dambullaScraper.js
const fetch = require("node-fetch").default || require("node-fetch");
const { supabase } = require("../../supabaseClient");

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
    .select("fruit_id, fruit_name, variety, price_per_unit, unit, currency")
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
    price_per_unit: r.price_per_unit,
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

        const price = parseFloat(priceStr.replace(/[^\d.]/g, ""));
        const fruitName = Object.entries(FRUIT_MAPPING).find(([key]) =>
          fruitNameRaw.includes(key)
        )?.[1];

        if (!fruitName || Number.isNaN(price)) {
          return;
        }

        rows.push({
          economic_center: ECONOMIC_CENTER,
          fruit_name: fruitName,
          variety: varietyRaw || null,
          price_per_unit: price,
          unit: unitRaw || "kg",
          currency: "LKR",
          source_url: DAMBULLA_URL,
          captured_at: new Date().toISOString(),
        });

        console.log(`[Dambulla] Parsed: ${fruitName} @ Rs.${price}/${unitRaw || 'kg'}`);
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
      console.warn("[Dambulla Import] No scraped rows. Using latest live prices as fallback.");
      rows = await getLatestPricesFallback(capturedAt, "live");
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
