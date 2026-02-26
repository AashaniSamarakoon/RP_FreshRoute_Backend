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

async function scrapeDambullaWithPuppeteer(retryCount = 0) {
  const puppeteer = require("puppeteer");
  const MAX_RETRIES = 2;
  
  let browser;
  try {
    console.log(`[Dambulla Puppeteer] Attempt ${retryCount + 1}/${MAX_RETRIES + 1} - Launching browser...`);
    browser = await puppeteer.launch({ 
      headless: "new", 
      args: [
        "--no-sandbox", 
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--disable-gpu"
      ] 
    });
    
    const page = await browser.newPage();
    
    // Set a user agent to avoid bot detection
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');
    
    console.log(`[Dambulla Puppeteer] Navigating to ${DAMBULLA_URL}...`);
    // Use 'domcontentloaded' instead of 'networkidle2' - faster and more reliable
    await page.goto(DAMBULLA_URL, { 
      waitUntil: "domcontentloaded", 
      timeout: 60000 
    });
    
    console.log(`[Dambulla Puppeteer] Page loaded, checking for price data...`);
    
    // First, check if page loaded successfully
    const title = await page.title();
    console.log(`[Dambulla Puppeteer] Page title: ${title}`);
    
    if (title.includes('404') || title.includes('Not Found')) {
      throw new Error('Page not found - 404 error');
    }
    
    // Initialize rows array
    let rows = [];
    
    // Check for search/filter functionality
    console.log(`[Dambulla Puppeteer] Checking for search/filter elements...`);
    const searchSelectors = [
      'input[type="search"]',
      'input[placeholder*="search" i]',
      'input[placeholder*="filter" i]',
      '.search',
      '#search',
      'select',
      'button'
    ];
    
    for (const selector of searchSelectors) {
      try {
        const elements = await page.$$(selector);
        if (elements.length > 0) {
          console.log(`[Dambulla Puppeteer] Found ${elements.length} ${selector} elements`);
          for (let i = 0; i < Math.min(elements.length, 3); i++) {
            const text = await elements[i].evaluate(el => el.textContent || el.placeholder || el.value);
            console.log(`[Dambulla Puppeteer] ${selector}[${i}]: "${text}"`);
          }
        }
      } catch (e) {
        // Ignore errors for selectors that don't exist
      }
    }
    
    console.log(`[Dambulla Puppeteer] Finished checking search elements, proceeding to search...`);
    
    // Try to search for our desired fruits
    console.log(`[Dambulla Puppeteer] Attempting to search for desired fruits...`);
    try {
      const searchInput = await page.$('input[placeholder*="search" i]');
      console.log(`[Dambulla Puppeteer] Search input found: ${!!searchInput}`);
      
      if (searchInput) {
        // Search for each desired fruit
        for (const fruit of DESIRED_FRUITS) {
          console.log(`[Dambulla Puppeteer] Searching for: ${fruit}`);
          
          // Clear search by selecting all and typing
          await searchInput.click({ clickCount: 3 }); // Select all
          await new Promise(resolve => setTimeout(resolve, 500));
          await searchInput.type(''); // Clear
          await new Promise(resolve => setTimeout(resolve, 500));
          await searchInput.type(fruit);
          
          // Try multiple ways to submit search
          let searchSubmitted = false;
          
          // First try pressing Enter
          try {
            await searchInput.press('Enter');
            console.log(`[Dambulla Puppeteer] Submitted search for ${fruit} via Enter`);
            searchSubmitted = true;
          } catch (e) {
            console.log(`[Dambulla Puppeteer] Enter key failed: ${e.message}`);
          }
          
          // If Enter didn't work, try clicking a search button
          if (!searchSubmitted) {
            try {
              const searchButton = await page.$('button[type="submit"], button[class*="search"], button[aria-label*="search"], input[type="submit"]');
              if (searchButton) {
                await searchButton.click();
                console.log(`[Dambulla Puppeteer] Submitted search for ${fruit} via button click`);
                searchSubmitted = true;
              }
            } catch (e) {
              console.log(`[Dambulla Puppeteer] Button click failed: ${e.message}`);
            }
          }
          
          if (!searchSubmitted) {
            console.log(`[Dambulla Puppeteer] Could not submit search for ${fruit}`);
            continue;
          }
          
          // Wait longer for search results to load, especially for Banana - Abul
          const waitTime = fruit === 'Banana - Abul' ? 12000 : 6000;
          console.log(`[Dambulla Puppeteer] Waiting ${waitTime}ms for search results to load for ${fruit}...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          
          // Try to wait for content to appear with multiple checks
          let contentLoaded = false;
          try {
            await page.waitForFunction(
              () => {
                const text = document.body.innerText;
                return text.includes('fruit') || 
                       text.includes('Price Range') ||
                       text.includes('Rs.') ||
                       text.includes('Range:') ||
                       text.includes('Date:') ||
                       text.includes(fruit.split(' ')[0]); // Check for first word of fruit name
              },
              { timeout: 10000 }
            );
            console.log(`[Dambulla Puppeteer] Search results loaded for ${fruit}`);
            contentLoaded = true;
          } catch (e) {
            console.log(`[Dambulla Puppeteer] Search results may not have loaded for ${fruit}: ${e.message}`);
          }
          
          // If content didn't load, try waiting a bit more and checking again
          if (!contentLoaded) {
            console.log(`[Dambulla Puppeteer] Waiting additional time for ${fruit}...`);
            await new Promise(resolve => setTimeout(resolve, 5000));
          }
          
          // Extract prices from search results
          const searchResults = await extractPricesFromPage(page, fruit);
          if (searchResults.length > 0) {
            console.log(`[Dambulla Puppeteer] Found ${searchResults.length} results for ${fruit}`);
            rows.push(...searchResults);
          } else {
            console.log(`[Dambulla Puppeteer] No results found for ${fruit} search`);
            
            // Special handling for Banana - Abul - try alternative search terms
            if (fruit === 'Banana - Abul') {
              console.log(`[Dambulla Puppeteer] Trying alternative search terms for Banana - Abul...`);
              
              const alternativeTerms = ['Banana', 'Abul', 'Banana Abul'];
              for (const altTerm of alternativeTerms) {
                console.log(`[Dambulla Puppeteer] Trying alternative term: ${altTerm}`);
                
                // Clear and search with alternative term
                await searchInput.click({ clickCount: 3 });
                await new Promise(resolve => setTimeout(resolve, 500));
                await searchInput.type('');
                await new Promise(resolve => setTimeout(resolve, 500));
                await searchInput.type(altTerm);
                await searchInput.press('Enter');
                
                console.log(`[Dambulla Puppeteer] Submitted alternative search for ${altTerm}`);
                await new Promise(resolve => setTimeout(resolve, 10000));
                
                const altResults = await extractPricesFromPage(page, 'Banana - Abul');
                if (altResults.length > 0) {
                  console.log(`[Dambulla Puppeteer] Found ${altResults.length} results with alternative term ${altTerm}`);
                  rows.push(...altResults);
                  break;
                }
              }
            }
          }
        }
      } else {
        console.log(`[Dambulla Puppeteer] No search input found`);
      }
    } catch (searchError) {
      console.log(`[Dambulla Puppeteer] Search functionality failed: ${searchError.message}`);
    }
    
    // If we found results from direct URLs, return them
    if (rows.length > 0) {
      console.log(`[Dambulla Puppeteer] Found ${rows.length} results from direct URLs, skipping fallback`);
      await browser.close();
      console.log(`[Dambulla Puppeteer] Successfully extracted ${rows.length} rows`);
      return rows.filter(r => r && r.length >= 3);
    }
    
    // If search didn't work or no results, fall back to extracting all visible prices
    if (rows.length === 0) {
      console.log(`[Dambulla Puppeteer] Falling back to extracting all visible prices...`);
      const allPrices = await extractPricesFromPage(page);
      rows.push(...allPrices);
    }
    
    // Try multiple selectors for price data (legacy - keeping for compatibility)
    const selectors = [
      "table tbody tr",
      "table tr", 
      ".price-table tr",
      ".daily-prices tr",
      "[class*='price'] tr",
      "tbody tr"
    ];
    
    for (const selector of selectors) {
      try {
        console.log(`[Dambulla Puppeteer] Trying selector: ${selector}`);
        await page.waitForSelector(selector, { timeout: 5000 });
        rows = await page.$$eval(selector, trs => trs.map(tr => {
          const cells = Array.from(tr.querySelectorAll("td, th")).map(cell => cell.innerText.trim());
          return cells;
        }));
        if (rows.length > 0) {
          console.log(`[Dambulla Puppeteer] Found ${rows.length} rows with selector: ${selector}`);
          break;
        }
      } catch (e) {
        console.log(`[Dambulla Puppeteer] Selector ${selector} not found or empty`);
      }
    }
    
    // If no table found, try extracting from the text content (React app format)
    if (rows.length === 0) {
      console.log(`[Dambulla Puppeteer] No table found, trying to extract from page text...`);
      const pageText = await page.evaluate(() => document.body.innerText);
      
      // Parse prices from text like "Cabbage vegetable Price Range: Rs. 90 - Rs. 100 Date: 2026-02-24"
      const priceRegex = /([A-Za-z\s-]+?)\s+vegetable\s+Price Range:\s*Rs\.\s*(\d+)\s*-\s*Rs\.\s*(\d+)\s+Date:\s*\d{4}-\d{2}-\d{2}/g;
      let match;
      while ((match = priceRegex.exec(pageText)) !== null) {
        const fruitName = match[1].trim();
        const minPrice = parseInt(match[2]);
        const maxPrice = parseInt(match[3]);
        rows.push([fruitName, '', `${minPrice}-${maxPrice}`]);
        console.log(`[Dambulla Puppeteer] Extracted: ${fruitName} @ Rs. ${minPrice}-${maxPrice}`);
      }
      
      if (rows.length > 0) {
        console.log(`[Dambulla Puppeteer] Successfully extracted ${rows.length} prices from text`);
      }
    }

    await browser.close();
    console.log(`[Dambulla Puppeteer] Successfully extracted ${rows.length} rows`);
    return rows.filter(r => r && r.length >= 3);
    
  } catch (err) {
    if (browser) {
      await browser.close().catch(() => {});
    }
    
    console.error(`[Dambulla Puppeteer] Attempt ${retryCount + 1} failed:`, err.message);
    
    // Retry on timeout or network errors
    if (retryCount < MAX_RETRIES && (
      err.message.includes('timeout') || 
      err.message.includes('Navigation') ||
      err.message.includes('net::')
    )) {
      console.log(`[Dambulla Puppeteer] Retrying in 3 seconds...`);
      await new Promise(resolve => setTimeout(resolve, 3000));
      return scrapeDambullaWithPuppeteer(retryCount + 1);
    }
    
    throw err;
  }
}

// Map fruit names from website to our DB
const FRUIT_MAPPING = {
  mango: "Mango",
  banana: "Banana",
  pineapple: "Pineapple",
  "tjc mango": "Mango",
  "banana abul": "Banana"
};

// Fruits to extract with their search terms
const DESIRED_FRUITS = [
  "Banana - Abul",
  "Mango- TJC", 
  "Pineapple"
];

// Build a price record from raw scraped data
function buildPriceRecord({ fruitNameRaw, varietyRaw, priceStr, unitRaw }) {
  try {
    // Clean fruit name
    let fruitName = fruitNameRaw.trim();
    if (FRUIT_MAPPING[fruitName.toLowerCase()]) {
      fruitName = FRUIT_MAPPING[fruitName.toLowerCase()];
    }

    // Check if this fruit matches our search terms
    const isDesired = DESIRED_FRUITS.some(searchTerm => 
      fruitName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      `${fruitName} ${varietyRaw || ''}`.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (!isDesired) {
      console.log(`[Dambulla] Skipping ${fruitName} ${varietyRaw || ''} - doesn't match search terms`);
      return null;
    }

    // Parse price range
    const parsed = parsePriceRange(priceStr);
    if (!parsed || parsed.minPrice < 0 || parsed.maxPrice < 0) {
      return null;
    }

    const { minPrice, maxPrice } = parsed;

    // Clean unit
    const unit = unitRaw.toLowerCase() === "kg" ? "kg" : "kg"; // Default to kg

    return {
      economic_center: ECONOMIC_CENTER,
      fruit_name: fruitName,
      variety: varietyRaw || null,
      min_price: minPrice,
      max_price: maxPrice,
      unit: unit,
      currency: "LKR",
      source_url: DAMBULLA_URL,
      captured_at: todayCapturedAtISO(),
    };
  } catch (err) {
    console.warn(`[buildPriceRecord] Error building record for ${fruitNameRaw}: ${err.message}`);
    return null;
  }
}

// Parse price range string like "90-100" or "Rs. 90 - Rs. 100"
function parsePriceRange(priceStr) {
  try {
    // Remove Rs. and clean
    let cleanPrice = priceStr.replace(/Rs\.?/gi, '').trim();
    
    // Handle single price
    if (!cleanPrice.includes('-')) {
      const price = parseFloat(cleanPrice);
      return { minPrice: price, maxPrice: price };
    }
    
    // Handle range
    const parts = cleanPrice.split('-').map(p => parseFloat(p.trim()));
    if (parts.length !== 2 || isNaN(parts[0]) || isNaN(parts[1])) {
      return null;
    }
    
    return { minPrice: parts[0], maxPrice: parts[1] };
  } catch (err) {
    console.warn(`[parsePriceRange] Error parsing "${priceStr}": ${err.message}`);
    return null;
  }
}

// Extract prices from the current page state
async function extractPricesFromPage(page, expectedFruitName = null) {
  console.log(`[Dambulla Puppeteer] extractPricesFromPage called with expectedFruitName: "${expectedFruitName}"`);
  const pageText = await page.evaluate(() => {
    // Get all text content
    const allText = document.body.innerText;
    console.log('[Dambulla Puppeteer] ===== FULL PAGE TEXT =====');
    console.log(allText);
    console.log('[Dambulla Puppeteer] ===== END PAGE TEXT =====');

    return allText;
  });

  const rows = [];

  if (expectedFruitName) {
    // For search results, look for the specific pattern we saw working
    console.log(`[Dambulla Puppeteer] Looking for prices for: ${expectedFruitName}`);

    // Pattern for search results: "Fruit Name\nfruit\nPrice Range: Rs. X - Rs. Y\nDate: YYYY-MM-DD"
    const searchPattern = new RegExp(`${expectedFruitName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\n\\s*fruit\\s*\\n\\s*Price Range:\\s*Rs\\.\\s*(\\d+)\\s*-\\s*Rs\\.\\s*(\\d+)\\s*\\n\\s*Date:\\s*\\d{4}-\\d{2}-\\d{2}`, 'g');

    console.log(`[Dambulla Puppeteer] Trying search pattern: ${searchPattern}`);
    let match;
    while ((match = searchPattern.exec(pageText)) !== null) {
      const minPrice = match[1];
      const maxPrice = match[2];

      console.log(`[Dambulla Puppeteer] Search pattern match: ${expectedFruitName} @ Rs. ${minPrice}-${maxPrice}`);

      // Validate prices
      const min = parseInt(minPrice);
      const max = parseInt(maxPrice);
      if (min >= 10 && max <= 2000 && min <= max) {
        rows.push([expectedFruitName, '', `${minPrice}-${maxPrice}`]);
        console.log(`[Dambulla Puppeteer] Extracted: ${expectedFruitName} @ Rs. ${minPrice}-${maxPrice}`);
        break; // Take the first valid match
      }
    }
    console.log(`[Dambulla Puppeteer] Search pattern found ${rows.length} matches for ${expectedFruitName}`);

    // If specific search pattern didn't work, try general price patterns
    if (rows.length === 0) {
      console.log(`[Dambulla Puppeteer] Search pattern failed, trying general price patterns...`);
      const generalPatterns = [
        /Price Range:\s*Rs\.\s*(\d+)\s*-\s*Rs\.\s*(\d+)/g,
        /Rs\.\s*(\d+)\s*-\s*Rs\.\s*(\d+)/g,
        /(\d+)\s*-\s*(\d+)/g
      ];

      for (const pattern of generalPatterns) {
        console.log(`[Dambulla Puppeteer] Trying general pattern: ${pattern}`);
        let match;
        while ((match = pattern.exec(pageText)) !== null) {
          const minPrice = match[1];
          const maxPrice = match[2] || match[1];

          const min = parseInt(minPrice);
          const max = parseInt(maxPrice);
          if (min >= 10 && max <= 2000 && min <= max) {
            rows.push([expectedFruitName, '', `${minPrice}-${maxPrice}`]);
            console.log(`[Dambulla Puppeteer] General pattern extracted: ${expectedFruitName} @ Rs. ${minPrice}-${maxPrice}`);
            break;
          }
        }
        if (rows.length > 0) break;
      }
    }

    console.log(`[Dambulla Puppeteer] Total results for ${expectedFruitName}: ${rows.length}`);
  } else {
    // Fallback: try multiple patterns for general extraction
    console.log(`[Dambulla Puppeteer] No expected fruit name, trying general extraction patterns...`);
    const patterns = [
      // Pattern for detailed view: "Fruit Name\nfruit\nPrice Range: Rs. X - Rs. Y Date: YYYY-MM-DD"
      /([A-Za-z\s\-]+?)\s*\n\s*fruit\s*\n\s*Price Range:\s*Rs\.\s*(\d+)\s*-\s*Rs\.\s*(\d+)\s+Date:\s*\d{4}-\d{2}-\d{2}/g,
      // Pattern for search results: "Fruit Name @ Rs. min-max"
      /([A-Za-z\s\-]+?)\s*@?\s*@\s*Rs\.\s*(\d+)-(\d+)/g,
      // Simple pattern: "Fruit Name Rs. min-max"
      /([A-Za-z\s\-]+?)\s+Rs\.\s*(\d+)-(\d+)/g,
      // Pattern for "Fruit Name @ Rs. min-max" with optional @
      /([A-Za-z\s\-]+?)\s*@?\s*Rs\.\s*(\d+)-(\d+)/g
    ];

    for (const pattern of patterns) {
      console.log(`[Dambulla Puppeteer] Trying pattern: ${pattern}`);
      let match;
      let matchCount = 0;
      while ((match = pattern.exec(pageText)) !== null) {
        matchCount++;
        const fruitName = match[1].trim();
        const minPrice = match[2];
        const maxPrice = match[3];

        console.log(`[Dambulla Puppeteer] Pattern match ${matchCount}: "${match[0]}" -> Fruit: "${fruitName}", Prices: ${minPrice}-${maxPrice}`);

        // Skip if fruit name is too long (likely header text) or contains unwanted words
        if (fruitName.length > 50 ||
            fruitName.toLowerCase().includes('dambulla') ||
            fruitName.toLowerCase().includes('economic') ||
            fruitName.toLowerCase().includes('center') ||
            fruitName.toLowerCase().includes('home') ||
            fruitName.toLowerCase().includes('daily') ||
            fruitName.toLowerCase().includes('price') ||
            fruitName.toLowerCase().includes('contact') ||
            fruitName.toLowerCase().includes('download') ||
            fruitName.toLowerCase().includes('view price history')) {
          console.log(`[Dambulla Puppeteer] Skipping fruit "${fruitName}" - contains unwanted text`);
          continue;
        }

        // Skip if prices are unreasonable
        const min = parseInt(minPrice);
        const max = parseInt(maxPrice);
        if (min < 10 || max > 2000 || min > max) {
          console.log(`[Dambulla Puppeteer] Skipping fruit "${fruitName}" - unreasonable prices ${min}-${max}`);
          continue;
        }

        rows.push([fruitName, '', `${minPrice}-${maxPrice}`]);
        console.log(`[Dambulla Puppeteer] Extracted: ${fruitName} @ Rs. ${minPrice}-${maxPrice}`);
      }
      console.log(`[Dambulla Puppeteer] Pattern ${pattern} found ${matchCount} matches`);
    }
  }

  return rows;
}

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

    // Check which fruits already exist for today to avoid duplicates
    const todayDate = capturedAt.slice(0, 10);
    const { data: existingPrices, error: existingErr } = await supabase
      .from("economic_center_prices")
      .select("fruit_name")
      .eq("economic_center", ECONOMIC_CENTER)
      .gte("captured_at", `${todayDate}T00:00:00.000Z`)
      .lt("captured_at", `${todayDate}T23:59:59.999Z`);

    if (existingErr) throw existingErr;

    // Create a set of existing fruit names for today
    const existingFruits = new Set(existingPrices?.map(row => row.fruit_name) || []);

    // Filter out fruits that already exist for today
    const newRowsOnly = enrichedRows.filter(row => !existingFruits.has(row.fruit_name));

    console.log(`[Dambulla Import] Found ${existingFruits.size} existing fruits for today, ${newRowsOnly.length} new fruits to add`);

    // Only insert new fruits that don't already exist
    if (newRowsOnly.length > 0) {
      const { error: insertErr } = await supabase
        .from("economic_center_prices")
        .insert(newRowsOnly);

      if (insertErr) throw insertErr;
      console.log(`[Dambulla Import] Successfully inserted ${newRowsOnly.length} new fruit prices`);
    } else {
      console.log(`[Dambulla Import] No new fruits to add - all fruits already exist for today`);
    }

    // Send alerts for each unique fruit that was actually inserted
    const fruitsUpdated = new Map();
    newRowsOnly.forEach(row => {
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

    console.log(`[Dambulla Alert] Triggered alerts for ${fruitsUpdated.size} new fruits`);

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
        records_imported: newRowsOnly.length,
        completed_at: completedAt.toISOString(),
      })
      .eq("id", jobId);

    if (usedFallback) {
      console.warn(`[Dambulla Import Job ${jobId}] Fallback used - cloned latest prices as today's data.`);
    }

    console.log(
      `[Dambulla Import Job ${jobId}] Success: ${newRowsOnly.length} new records imported in ${
        (completedAt - startTime) / 1000
      }s`
    );

    return { jobId, recordsImported: newRowsOnly.length };
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
