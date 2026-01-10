/**
 * Daily FreshRoute Price Updater
 * Checks economic center prices daily and updates freshroute_prices
 * Archives old records when target_date passes
 */

const { supabase } = require("../../utils/supabaseClient");
const { generateAllGrades } = require("./gradingService");
const { alertFreshRoutePriceUpdate } = require("../dataUpdateAlerts");
const { sendBatchSMS } = require("./smsService");
const { logSMSSend } = require("./forecastSMSBuilder");

/**
 * Immediately update FreshRoute prices for a specific fruit when economic center prices change
 * Archives current prices to history before updating
 * @param {string} fruitId - Fruit ID to update
 * @param {string} fruitName - Fruit name
 * @returns {object} - Result with archived and created counts
 */
async function updateFreshRoutePricesOnEconomicChange(fruitId, fruitName) {
  try {
    const today = new Date().toISOString().split("T")[0];
    console.log(`[FreshRoute Updater] Updating prices for ${fruitName} (immediate update from economic center change)...`);

    // Step 1: Archive current prices for this fruit to history
    const { data: currentPrices, error: fetchErr } = await supabase
      .from("freshroute_prices")
      .select("*")
      .eq("fruit_id", fruitId)
      .eq("target_date", today);

    if (fetchErr) {
      console.warn(`[FreshRoute Updater] Error fetching current prices for ${fruitName}:`, fetchErr.message);
    } else if (currentPrices && currentPrices.length > 0) {
      // Archive current prices to history
      const archiveRecords = currentPrices.map(r => ({
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

      const { error: insertErr } = await supabase
        .from("freshroute_price_history")
        .insert(archiveRecords);

      if (insertErr) {
        console.warn(`[FreshRoute Updater] Error archiving old prices for ${fruitName}:`, insertErr.message);
      } else {
        console.log(`[FreshRoute Updater] ✓ Archived ${archiveRecords.length} old price records for ${fruitName} to history`);
      }

      // Delete from active table
      const { error: deleteErr } = await supabase
        .from("freshroute_prices")
        .delete()
        .eq("fruit_id", fruitId)
        .eq("target_date", today);

      if (deleteErr) {
        console.warn(`[FreshRoute Updater] Error deleting old prices for ${fruitName}:`, deleteErr.message);
      }
    }

    // Step 2: Get latest economic center prices
    const { data: prices, error: priceErr } = await supabase
      .from("economic_center_prices")
      .select("min_price, max_price, variety")
      .eq("fruit_id", fruitId)
      .order("captured_at", { ascending: false })
      .limit(1);

    if (priceErr) {
      console.error(`[FreshRoute Updater] Error fetching economic prices for ${fruitName}:`, priceErr.message);
      return { archived: currentPrices ? currentPrices.length : 0, created: 0 };
    }

    if (!prices || prices.length === 0) {
      console.log(`[FreshRoute Updater] No economic center prices found for ${fruitName}, skipping new prices`);
      return { archived: currentPrices ? currentPrices.length : 0, created: 0 };
    }

    const { min_price, max_price, variety } = prices[0];
    if (!min_price || !max_price) {
      console.log(`[FreshRoute Updater] Invalid economic prices for ${fruitName}, skipping`);
      return { archived: currentPrices ? currentPrices.length : 0, created: 0 };
    }

    // Step 3: Get fruit details
    const { data: fruitData, error: fruitErr } = await supabase
      .from("fruits")
      .select("id, name, variety")
      .eq("id", fruitId)
      .limit(1);

    if (fruitErr || !fruitData || fruitData.length === 0) {
      console.error(`[FreshRoute Updater] Error fetching fruit details for ${fruitId}`);
      return { archived: currentPrices ? currentPrices.length : 0, created: 0 };
    }

    const fruit = fruitData[0];

    // Step 4: Generate new graded prices
    const gradedPrices = generateAllGrades(
      fruit,
      min_price,
      max_price,
      today
    );

    // Step 5: Insert new prices
    const { error: insertErr } = await supabase
      .from("freshroute_prices")
      .insert(gradedPrices);

    if (insertErr) {
      console.error(`[FreshRoute Updater] Error inserting new prices for ${fruitName}:`, insertErr.message);
      return { archived: currentPrices ? currentPrices.length : 0, created: 0 };
    }

    console.log(`[FreshRoute Updater] ✓ Created ${gradedPrices.length} new grades for ${fruitName}`);

    // Step 6: Send SMS to farmers about price update
    try {
      const { data: farmers, error: farmersErr } = await supabase
        .from("users")
        .select("id, name, phone")
        .eq("role", "farmer")
        .eq("sms_alerts_enabled", true)
        .not("phone", "is", null);

      if (!farmersErr && farmers && farmers.length > 0) {
        const priceList = gradedPrices
          .map(p => `Grade ${p.grade}: Rs. ${p.price}`)
          .join("\n");

        const smsMessage = `💰 FreshRoute Price Update\n\n${fruitName} prices updated for ${today}:\n\n${priceList}\n\nCheck FreshRoute app for details!`;

        const smsBatch = farmers.map(f => ({
          phone: f.phone,
          message: smsMessage,
        }));

        const sendResults = await sendBatchSMS(smsBatch);
        
        // Log each SMS send result
        let successCount = 0;
        let failCount = 0;
        for (let i = 0; i < farmers.length; i++) {
          const farmer = farmers[i];
          const result = sendResults[i];
          
          await logSMSSend(
            farmer.id,
            farmer.phone,
            result.status === 'fulfilled' ? 'sent' : 'failed',
            result.status === 'rejected' ? result.result : null
          );
          
          if (result.status === 'fulfilled') {
            successCount++;
          } else {
            failCount++;
          }
        }
        
        console.log(`[FreshRoute SMS] ✓ Price update: ${successCount} sent, ${failCount} failed (${fruitName})`);
      }
    } catch (smsErr) {
      console.warn(`[FreshRoute SMS] Error sending price update SMS:`, smsErr.message);
    }

    // Step 7: Trigger a single alert with all grade prices
    const gradeSummary = gradedPrices
      .map(p => ({ grade: p.grade, price: p.price }))
      .sort((a, b) => a.grade.localeCompare(b.grade));

    try {
      await alertFreshRoutePriceUpdate({
        fruit_name: fruit.name,
        target_date: today,
        grades: gradeSummary,
      });
    } catch (err) {
      console.warn(`[FreshRoute Alert] Error triggering alert:`, err.message);
    }

    return { 
      archived: currentPrices ? currentPrices.length : 0, 
      created: gradedPrices.length 
    };
  } catch (err) {
    console.error("[FreshRoute Updater] Immediate update error:", err.message);
    throw err;
  }
}

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

        // Send SMS to farmers about price update
        try {
          const { data: farmers, error: farmersErr } = await supabase
            .from("users")
            .select("id, name, phone")
            .eq("role", "farmer")
            .eq("sms_alerts_enabled", true)
            .not("phone", "is", null);

          if (!farmersErr && farmers && farmers.length > 0) {
            const priceList = gradedPrices
              .map(p => `Grade ${p.grade}: Rs. ${p.price}`)
              .join("\n");

            const smsMessage = `💰 FreshRoute Price Update\n\n${fruit.name} prices updated for ${today}:\n\n${priceList}\n\nCheck FreshRoute app for details!`;

            const smsBatch = farmers.map(f => ({
              phone: f.phone,
              message: smsMessage,
            }));

            const sendResults = await sendBatchSMS(smsBatch);
            
            // Log each SMS send result
            let successCount = 0;
            let failCount = 0;
            for (let i = 0; i < farmers.length; i++) {
              const farmer = farmers[i];
              const result = sendResults[i];
              
              await logSMSSend(
                farmer.id,
                farmer.phone,
                result.status === 'fulfilled' ? 'sent' : 'failed',
                result.status === 'rejected' ? result.result : null
              );
              
              if (result.status === 'fulfilled') {
                successCount++;
              } else {
                failCount++;
              }
            }
            
            console.log(`[FreshRoute SMS] ✓ Price update: ${successCount} sent, ${failCount} failed (${fruit.name})`);
          }
        } catch (smsErr) {
          console.warn(`[FreshRoute SMS] Error sending price update SMS:`, smsErr.message);
        }

        // Trigger a single alert with all grade prices (async, don't block loop)
        const gradeSummary = gradedPrices
          .map(p => ({ grade: p.grade, price: p.price }))
          .sort((a, b) => a.grade.localeCompare(b.grade));

        alertFreshRoutePriceUpdate({
          fruit_name: fruit.name,
          target_date: today,
          grades: gradeSummary,
        }).catch(err => 
          console.warn(`[FreshRoute Alert] Failed to alert for ${fruit.name}:`, err.message)
        );
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
  updateFreshRoutePricesOnEconomicChange,
  archiveOldPrices,
  hasPricesChanged,
  initializeTodaysPrices,
  populateFromEconomicCenter,
};
