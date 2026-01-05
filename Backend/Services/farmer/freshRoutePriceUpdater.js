/**
 * Daily FreshRoute Price Updater
 * Checks economic center prices daily and updates freshroute_prices
 * Archives old records when target_date passes
 */

const { supabase } = require("../../utils/supabaseClient");
const { generateAllGrades } = require("./gradingService");

/**
 * Update FreshRoute prices based on latest economic center prices
 * Runs daily to sync prices with economic center changes
 * @returns {object} - Result with counts of created/updated/archived records
 */
async function updateFreshRoutePrices() {
  try {
    const today = new Date().toISOString().split("T")[0];
    console.log(`[FreshRoute Updater] Starting daily price update for ${today}...`);

    // Step 1: Get all fruits
    const { data: fruits, error: fruitsErr } = await supabase
      .from("fruits")
      .select("id, name, variety");

    if (fruitsErr) throw fruitsErr;
    if (!fruits || fruits.length === 0) {
      console.log("[FreshRoute Updater] No fruits found");
      return { created: 0, updated: 0, archived: 0 };
    }

    // Step 2: For each fruit, get today's economic center prices
    let createdCount = 0;
    let updatedCount = 0;

    for (const fruit of fruits) {
      try {
        // Get today's economic center prices for this fruit
        const { data: prices, error: priceErr } = await supabase
          .from("economic_center_prices")
          .select("min_price, max_price")
          .eq("fruit_id", fruit.id)
          .gte("captured_at", `${today}T00:00:00Z`)
          .lt("captured_at", `${today}T23:59:59Z`)
          .limit(1);

        if (priceErr) {
          console.warn(`[FreshRoute Updater] Error fetching prices for ${fruit.name}:`, priceErr.message);
          continue;
        }

        // If no prices today, skip this fruit
        if (!prices || prices.length === 0) {
          console.log(`[FreshRoute Updater] No prices today for ${fruit.name}, skipping`);
          continue;
        }

        const { min_price, max_price } = prices[0];
        if (!min_price || !max_price) {
          console.log(`[FreshRoute Updater] Invalid prices for ${fruit.name}, skipping`);
          continue;
        }

        // Step 3: Generate graded prices
        const gradedPrices = generateAllGrades(
          fruit,
          min_price,
          max_price,
          today
        );

        // Step 4: Upsert into freshroute_prices (insert or update)
        const { error: upsertErr } = await supabase
          .from("freshroute_prices")
          .upsert(gradedPrices, {
            onConflict: "fruit_id,target_date,grade",
            ignoreDuplicates: false,
          });

        if (upsertErr) {
          console.warn(`[FreshRoute Updater] Upsert error for ${fruit.name}:`, upsertErr.message);
          continue;
        }

        console.log(`[FreshRoute Updater] Upserted ${gradedPrices.length} grades for ${fruit.name}`);
        createdCount += gradedPrices.length;
      } catch (err) {
        console.warn(`[FreshRoute Updater] Error processing ${fruit.name}:`, err.message);
      }
    }

    // Step 5: Archive old records (older than today)
    const archivedCount = await archiveOldPrices();

    console.log(
      `[FreshRoute Updater] Daily update complete: Created/Updated ${createdCount}, Archived ${archivedCount}`
    );

    return {
      created: createdCount,
      updated: 0, // Upsert doesn't distinguish
      archived: archivedCount,
    };
  } catch (err) {
    console.error("[FreshRoute Updater] Fatal error:", err.message);
    throw err;
  }
}

/**
 * Archive expired FreshRoute prices (target_date older than today)
 * Moves them to freshroute_price_history table
 * @returns {number} - Count of archived records
 */
async function archiveOldPrices() {
  try {
    const today = new Date().toISOString().split("T")[0];

    // Get records with target_date < today
    const { data: oldRecords, error: fetchErr } = await supabase
      .from("freshroute_prices")
      .select("*")
      .lt("target_date", today);

    if (fetchErr) throw fetchErr;

    if (!oldRecords || oldRecords.length === 0) {
      console.log("[FreshRoute Archiver] No old prices to archive");
      return 0;
    }

    // Prepare archive records
    const archiveRecords = oldRecords.map(r => ({
      id: r.id,
      fruit_id: r.fruit_id,
      fruit_name: r.fruit_name,
      variety: r.variety,
      grade: r.grade,
      target_date: r.target_date,
      price: r.price,
      source_min_price: r.source_min_price,
      source_max_price: r.source_max_price,
      margin_pct: r.margin_pct,
      archived_at: new Date().toISOString(),
      created_at: r.created_at,
      updated_at: r.updated_at,
    }));

    // Insert into history
    const { error: insertErr } = await supabase
      .from("freshroute_price_history")
      .insert(archiveRecords);

    if (insertErr) throw insertErr;

    // Delete from active table
    const { error: deleteErr } = await supabase
      .from("freshroute_prices")
      .delete()
      .lt("target_date", today);

    if (deleteErr) throw deleteErr;

    console.log(`[FreshRoute Archiver] Archived ${oldRecords.length} records to history`);
    return oldRecords.length;
  } catch (err) {
    console.error("[FreshRoute Archiver] Error:", err.message);
    throw err;
  }
}

/**
 * Check if economic center prices have changed since last update
 * @param {string} fruitId - Fruit ID
 * @param {string} targetDate - Target date (YYYY-MM-DD)
 * @returns {boolean} - True if prices changed, false otherwise
 */
async function hasPricesChanged(fruitId, targetDate) {
  try {
    // Get current economic center prices
    const { data: currentPrices, error: currentErr } = await supabase
      .from("economic_center_prices")
      .select("min_price, max_price")
      .eq("fruit_id", fruitId)
      .gte("captured_at", `${targetDate}T00:00:00Z`)
      .lt("captured_at", `${targetDate}T23:59:59Z`)
      .limit(1);

    if (currentErr) throw currentErr;
    if (!currentPrices || currentPrices.length === 0) return false;

    // Get stored freshroute prices for comparison
    const { data: storedPrices, error: storedErr } = await supabase
      .from("freshroute_prices")
      .select("source_min_price, source_max_price")
      .eq("fruit_id", fruitId)
      .eq("target_date", targetDate)
      .limit(1);

    if (storedErr) throw storedErr;
    if (!storedPrices || storedPrices.length === 0) return true; // New date, consider as changed

    const current = currentPrices[0];
    const stored = storedPrices[0];

    // Compare prices
    return (
      Number(current.min_price) !== Number(stored.source_min_price) ||
      Number(current.max_price) !== Number(stored.source_max_price)
    );
  } catch (err) {
    console.error("[Price Change Check] Error:", err.message);
    return false;
  }
}

/**
 * Populate FreshRoute prices from economic_center_prices for specific fruits
 * Used on startup to ensure key fruits (Banana, Mango, Pineapple) have prices
 */
async function populateFromEconomicCenter() {
  try {
    console.log("[FreshRoute Init] Populating from economic center prices...");
    const today = new Date().toISOString().split("T")[0];
    
    // These are the fruit IDs for Banana (Ambul), Mango (TJC), Pineapple (All)
    const targetFruits = [
      '41c979ad-24e9-4c08-9d1f-5a891e4f0df4', // Banana Ambul
      '69005a2e-534a-4ad6-97a8-f9cd2870c9c', // Mango TJC
      '962b16ea-7710-4f0d-a880-e865f425afeb'  // Pineapple All
    ];

    let populatedCount = 0;

    for (const fruitId of targetFruits) {
      try {
        // Get latest economic center price for this fruit
        const { data: ecoPrice, error: ecoPriceErr } = await supabase
          .from("economic_center_prices")
          .select("fruit_id, min_price, max_price")
          .eq("fruit_id", fruitId)
          .gte("captured_at", `${today}T00:00:00Z`)
          .lt("captured_at", `${today}T23:59:59Z`)
          .order("captured_at", { ascending: false })
          .limit(1);

        if (ecoPriceErr) {
          console.warn(`[FreshRoute Init] Error fetching economic price for fruit ${fruitId}:`, ecoPriceErr.message);
          continue;
        }

        if (!ecoPrice || ecoPrice.length === 0) {
          console.log(`[FreshRoute Init] No economic center price found for fruit ${fruitId} today`);
          continue;
        }

        const { min_price, max_price } = ecoPrice[0];

        // Get fruit details
        const { data: fruit, error: fruitErr } = await supabase
          .from("fruits")
          .select("id, name, variety")
          .eq("id", fruitId)
          .limit(1);

        if (fruitErr || !fruit || fruit.length === 0) {
          console.warn(`[FreshRoute Init] Could not find fruit with ID ${fruitId}`);
          continue;
        }

        const fruitData = fruit[0];

        // Generate all 4 grades
        const gradedPrices = generateAllGrades(fruitData, min_price, max_price, today);

        // Upsert into freshroute_prices
        const { error: upsertErr } = await supabase
          .from("freshroute_prices")
          .upsert(gradedPrices, {
            onConflict: "fruit_id,target_date,grade",
            ignoreDuplicates: false,
          });

        if (upsertErr) {
          console.warn(`[FreshRoute Init] Upsert error for ${fruitData.name}:`, upsertErr.message);
          continue;
        }

        console.log(`[FreshRoute Init] ✓ Populated 4 grades for ${fruitData.name} (${fruitData.variety})`);
        populatedCount++;
      } catch (err) {
        console.warn(`[FreshRoute Init] Error processing fruit ${fruitId}:`, err.message);
        continue;
      }
    }

    return {
      message: `Initialized prices for ${populatedCount} fruits from economic center`,
      fruitsInitialized: populatedCount
    };
  } catch (err) {
    console.error("[FreshRoute Init] Population error:", err.message);
    throw err;
  }
}

/**
 * Initialize freshroute_prices table on startup
 * Ensures all fruits have today's prices
 */
async function initializeTodaysPrices() {
  try {
    console.log("[FreshRoute Init] Initializing today's prices...");
    
    // First, populate from economic center prices for key fruits
    const populateResult = await populateFromEconomicCenter();
    console.log("[FreshRoute Init] Population result:", populateResult);

    // Then run full update for all other fruits
    const updateResult = await updateFreshRoutePrices();
    console.log("[FreshRoute Init] Full update result:", updateResult);

    return {
      populated: populateResult,
      updated: updateResult
    };
  } catch (err) {
    console.error("[FreshRoute Init] Error:", err.message);
    throw err;
  }
}

module.exports = {
  updateFreshRoutePrices,
  archiveOldPrices,
  hasPricesChanged,
  initializeTodaysPrices,
  populateFromEconomicCenter,
};
