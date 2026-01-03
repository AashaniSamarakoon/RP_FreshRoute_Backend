const { supabase } = require("../utils/supabaseClient");

// Configurable Weights
const W_REP = 0.5; // Reputation Weight
const W_PRICE = 0.3; // Price Weight
const W_LOC = 0.2; // Location Weight

// Helper: Haversine Distance (in km)
const getDistanceKm = (lat1, lon1, lat2, lon2) => {
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
    // We join estimated_stock with farmer to get location/reputation.
    // Note: Assuming 'price_per_kg' exists in estimated_stock and 'reputation', 'latitude', 'longitude' in farmer.
    const { data: pool, error: poolError } = await supabase
      .from("estimated_stock")
      .select(
        `
        id,
        quantity,
        grade,
        price_per_kg, 
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
      .eq("grade", order.grade) // Hard constraint on grade
      .gte("quantity", 1); // Ensure they have some stock

    if (poolError) throw new Error(poolError.message);
    if (!pool || pool.length === 0) {
      console.log("[Matching] No eligible farmers found.");
      return [];
    }

    // --- Step 3: Multi-Factor Scoring ---

    // 3a. Prepare Data & Calculate Max Price for Normalization
    let maxPrice = 0;
    const candidates = pool.map((item) => {
      const price = item.price_per_kg || 0; // Default to 0 if missing
      if (price > maxPrice) maxPrice = price;
      return {
        stock_id: item.id,
        farmer_id: item.farmer.id,
        available_qty: item.quantity,
        price: price,
        reputation: item.farmer.reputation || 0.5, // Default neutral reputation
        lat: item.farmer.latitude,
        lon: item.farmer.longitude,
        score: 0,
      };
    });

    // 3b. Calculate Location Score (Clustering)
    // Logic: Count neighbors within 10km. Normalize by dividing by total candidates.
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

    // 3c. Calculate Final Match Score
    candidates.forEach((c) => {
      // Normalize Price: Lower is better. 1 - (price / max). Avoid div by zero.
      const priceScore = maxPrice > 0 ? 1 - c.price / maxPrice : 1;

      // Normalize Reputation: Assuming DB stores 0-5, normalize to 0-1.
      // If already 0-1, use as is. Let's assume 0-5 scale.
      const repScore = c.reputation / 5;

      c.finalScore =
        W_REP * repScore + W_PRICE * priceScore + W_LOC * c.locationScore;
    });

    // Sort by Score Descending
    candidates.sort((a, b) => b.finalScore - a.finalScore);

    // --- Step 4: Aggregation Loop (Greedy) ---
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
      });

      remainingQty -= takeQty;
    }

    // --- Step 5: Proposal and Execution (Save to DB) ---
    // We save the "deals" to a table, e.g., 'order_assignments'
    if (fulfillmentPlan.length > 0) {
      const { error: insertError } = await supabase
        .from("order_assignments")
        .insert(fulfillmentPlan);

      if (insertError)
        console.error("[Matching] Failed to save assignments:", insertError);
      else
        console.log(
          `[Matching] Successfully assigned ${fulfillmentPlan.length} farmers to Order ${orderId}`
        );
    }

    return fulfillmentPlan;
  } catch (err) {
    console.error("[Matching] Algorithm failed:", err);
    return [];
  }
};

module.exports = { runMatchingAlgorithm };
