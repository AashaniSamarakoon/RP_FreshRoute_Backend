// services/dambullaScraper.js
const fetch = require("node-fetch");
const { supabase } = require("../supabaseClient");

const DAMBULLA_URL = "https://dambulladec.com/home-dailyprice";
const ECONOMIC_CENTER = "Dambulla Dedicated Economic Centre";

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
    const rows = await scrapeDambulla();

    if (rows.length === 0) {
      throw new Error("No data scraped from Dambulla");
    }

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

    // Upsert into DB
    const { error: upsertErr } = await supabase
      .from("economic_center_prices")
      .upsert(enrichedRows, {
        onConflict: "economic_center, fruit_id, captured_at",
      });

    if (upsertErr) throw upsertErr;

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

    console.log(
      `[Dambulla Import Job ${jobId}] Success: ${rows.length} records imported in ${
        (completedAt - startTime) / 1000
      }s`
    );

    return { jobId, recordsImported: rows.length };
  } catch (err) {
    console.error(`[Dambulla Import Job ${jobId}] Error: ${err.message}`);

    // Log failure
    await supabase
      .from("scraping_jobs")
      .update({
        status: "failed",
        error_message: err.message,
        completed_at: new Date().toISOString(),
      })
      .eq("id", jobId)
      .catch(e => console.error("Failed to log error:", e));

    throw err;
  }
}

module.exports = { scrapeDambulla, importDambullaPrices };
