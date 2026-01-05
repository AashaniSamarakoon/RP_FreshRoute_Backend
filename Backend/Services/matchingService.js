const { supabase } = require("../utils/supabaseClient");

// Configurable Weights (Location-focused)
const W_LOC = 0.7; // Location Weight (70%)
const W_REP = 0.3; // Reputation Weight (30%)

// Helper: Haversine Distance (in km)
const getDistanceKm = (lat1, lon1, lat2, lon2) => {
  if (!lat1 || !lon1 || !lat2 || !lon2) return Infinity;
  const R = 6371; // Radius of the earth in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const runMatchingAlgorithm = async (orderId) => {
  console.log(`[Matching] Starting algorithm for Order ID: ${orderId}`);

  try {
    // --- Step 1: Data Ingestion (Fetch Order) ---
    const { data: order, error: orderError } = await supabase
      .from("placed_orders")
      .select("*")
      .eq("id", orderId)
      .single();

    if (orderError || !order) throw new Error("Order not found");

    // --- Step 2: Initial Filtering (Get Eligible Farmers/Stock) ---
    // Filters: fruit_type, variant, grade, harvest date, quantity
    const { data: pool, error: poolError } = await supabase
      .from("estimated_stock")
      .select(
        `
        id,
        quantity,
        grade,
        estimated_harvest_date,
        farmer:farmer_id (
          id,
          reputation,
          latitude,
          longitude
        )
      `
      )
      .eq("fruit_type", order.fruit_type)
      .eq("variant", order.variant)
      .eq("grade", order.grade) // Hard constraint: exact grade match
      .lte("estimated_harvest_date", order.required_date) // Farmer can harvest before buyer needs
      .gte("quantity", 1); // Has stock available

    if (poolError) throw new Error(poolError.message);
    if (!pool || pool.length === 0) {
      console.log("[Matching] No eligible farmers found.");
      return [];
    }

    // --- Step 3: Prepare Candidates ---
    const candidates = pool.map((item) => ({
      stock_id: item.id,
      farmer_id: item.farmer.id,
      available_qty: item.quantity,
      estimated_harvest_date: item.estimated_harvest_date,
      reputation: item.farmer.reputation || 2.5, // Default neutral reputation
      lat: item.farmer.latitude,
      lon: item.farmer.longitude,
      locationScore: 0,
      finalScore: 0,
    }));

    // --- Step 4: Calculate Location Score (Clustering) ---
    // Higher score = farmer is in a dense cluster (good for logistics)
    candidates.forEach((c1) => {
      let neighbors = 0;
      candidates.forEach((c2) => {
        if (c1.farmer_id !== c2.farmer_id) {
          const dist = getDistanceKm(c1.lat, c1.lon, c2.lat, c2.lon);
          if (dist <= 10) neighbors++; // 10km cluster radius
        }
      });
      // Normalize location score (0 to 1)
      c1.locationScore =
        candidates.length > 1 ? neighbors / (candidates.length - 1) : 0;
    });

    // --- Step 5: Calculate Final Match Score ---
    candidates.forEach((c) => {
      // Normalize Reputation: DB stores 0-5, normalize to 0-1
      const repScore = c.reputation / 5;

      // Final score: 70% Location + 30% Reputation
      c.finalScore = W_LOC * c.locationScore + W_REP * repScore;
    });

    // Sort by Score Descending (best matches first)
    candidates.sort((a, b) => b.finalScore - a.finalScore);

    // --- Step 6: Aggregation Loop (Greedy Quantity Allocation) ---
    let remainingQty = order.quantity;
    const fulfillmentPlan = [];

    for (const candidate of candidates) {
      if (remainingQty <= 0) break;

      const takeQty = Math.min(remainingQty, candidate.available_qty);

      fulfillmentPlan.push({
        order_id: order.id,
        stock_id: candidate.stock_id,
        farmer_id: candidate.farmer_id,
        quantity_allocated: takeQty,
        match_score: candidate.finalScore,
        farmer_lat: candidate.lat,
        farmer_lon: candidate.lon,
        farmer_reputation: candidate.reputation,
      });

      remainingQty -= takeQty;
    }

    // NOTE: We do NOT save to DB here anymore.
    // Matches are returned to buyer for selection first.
    // Only after buyer selects and farmer confirms, we save to order_assignments.

    if (remainingQty > 0) {
      console.log(
        `[Matching] Warning: Order ${orderId} can only be partially fulfilled. Remaining: ${remainingQty} units`
      );
    }

    console.log(
      `[Matching] Found ${fulfillmentPlan.length} potential matches for Order ${orderId}`
    );

    return fulfillmentPlan;
  } catch (err) {
    console.error("[Matching] Algorithm failed:", err);
    return [];
  }
};

// Batch matching for all unfulfilled orders (called by cron job)
const runBatchMatching = async () => {
  console.log(
    `[Batch Matching] Starting batch run at ${new Date().toISOString()}`
  );

  try {
    // Get all OPEN orders that haven't been fully matched and not expired
    const { data: openOrders, error: ordersError } = await supabase
      .from("placed_orders")
      .select("id, required_date")
      .eq("status", "OPEN")
      .gte("required_date", new Date().toISOString().split("T")[0]); // Not expired

    if (ordersError) throw new Error(ordersError.message);
    if (!openOrders || openOrders.length === 0) {
      console.log("[Batch Matching] No open orders to process.");
      return { processed: 0, matched: 0 };
    }

    console.log(`[Batch Matching] Found ${openOrders.length} open orders.`);

    let matchedCount = 0;

    for (const order of openOrders) {
      const result = await runMatchingAlgorithm(order.id);
      if (result.length > 0) {
        matchedCount++;
        // Update order status to indicate matches are pending acceptance
        await supabase
          .from("placed_orders")
          .update({
            status: "PENDING_ACCEPTANCE",
            updated_at: new Date().toISOString(),
          })
          .eq("id", order.id);
      }
    }

    console.log(
      `[Batch Matching] Completed. Matched: ${matchedCount}/${openOrders.length}`
    );
    return { processed: openOrders.length, matched: matchedCount };
  } catch (err) {
    console.error("[Batch Matching] Failed:", err);
    return { processed: 0, matched: 0, error: err.message };
  }
};

// Trigger matching when new stock is added by a farmer
const onNewStockAdded = async (stockId) => {
  console.log(`[Stock Event] New stock added: ${stockId}`);

  try {
    // Get the new stock details
    const { data: stock, error: stockError } = await supabase
      .from("estimated_stock")
      .select("fruit_type, variant, grade, estimated_harvest_date")
      .eq("id", stockId)
      .single();

    if (stockError || !stock) {
      console.log("[Stock Event] Could not fetch stock details.");
      return;
    }

    // Find matching OPEN orders that could be fulfilled by this stock
    const { data: matchingOrders, error: ordersError } = await supabase
      .from("placed_orders")
      .select("id")
      .eq("status", "OPEN")
      .eq("fruit_type", stock.fruit_type)
      .eq("variant", stock.variant)
      .eq("grade", stock.grade)
      .gte("required_date", stock.estimated_harvest_date); // Buyer needs it after harvest date

    if (ordersError || !matchingOrders || matchingOrders.length === 0) {
      console.log("[Stock Event] No matching open orders found.");
      return;
    }

    console.log(
      `[Stock Event] Found ${matchingOrders.length} potential orders to match.`
    );

    // Run matching for each relevant order
    for (const order of matchingOrders) {
      const result = await runMatchingAlgorithm(order.id);
      if (result.length > 0) {
        await supabase
          .from("placed_orders")
          .update({
            status: "PENDING_ACCEPTANCE",
            updated_at: new Date().toISOString(),
          })
          .eq("id", order.id);
      }
    }

    console.log("[Stock Event] Matching completed for new stock.");
  } catch (err) {
    console.error("[Stock Event] Matching failed:", err);
  }
};

// Mark expired orders (orders past their required_date with no match)
const markExpiredOrders = async () => {
  console.log(`[Expiry Check] Running at ${new Date().toISOString()}`);

  try {
    const today = new Date().toISOString().split("T")[0];

    const { data: expiredOrders, error } = await supabase
      .from("placed_orders")
      .update({ status: "EXPIRED", updated_at: new Date().toISOString() })
      .eq("status", "OPEN")
      .lt("required_date", today)
      .select("id");

    if (error) throw new Error(error.message);

    const count = expiredOrders ? expiredOrders.length : 0;
    console.log(`[Expiry Check] Marked ${count} orders as expired.`);
    return { expired: count };
  } catch (err) {
    console.error("[Expiry Check] Failed:", err);
    return { expired: 0, error: err.message };
  }
};

module.exports = {
  runMatchingAlgorithm,
  runBatchMatching,
  onNewStockAdded,
  markExpiredOrders,
};
