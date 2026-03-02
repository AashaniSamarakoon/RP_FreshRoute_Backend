const { supabase } = require("../utils/supabaseClient");

// ─── Configurable Weights ─────────────────────────────────────────────────────
const W_LOC = 0.35; // Distance from farmer → buyer delivery location (35%)
const W_REP = 0.15; // Farmer reputation                               (15%)
const W_DATE = 0.15; // Harvest date proximity to required date         (15%)
const W_QTY = 0.15; // Quantity fulfillment ratio                      (15%)
const W_QUALITY = 0.2; // Grade/quality match                             (20%)

const MAX_DISTANCE_KM = 300; // Farmers beyond this score 0 for location
const MAX_DAYS_WINDOW = 7; // Harvest dates more than 7 days early score 0
const RESERVATION_EXPIRY_MINUTES = 24 * 60; // 24 hours

// Grade hierarchy — A is highest, C is lowest
const GRADE_RANK = { A: 3, B: 2, C: 1 };

/**
 * Returns a quality score 0–1:
 *   1.0 — exact grade match
 *   0.7 — stock grade is HIGHER than required (acceptable but more than needed)
 *   0.0 — stock grade is LOWER  than required (unacceptable — filtered out)
 */
const getGradeScore = (stockGrade, orderGrade) => {
  const stockRank = GRADE_RANK[stockGrade] ?? 2;
  const orderRank = GRADE_RANK[orderGrade] ?? 2;
  if (stockRank === orderRank) return 1.0;
  if (stockRank > orderRank) return 0.7;
  return 0.0;
};

// ─── Haversine Distance (km) ──────────────────────────────────────────────────
const getDistanceKm = (lat1, lon1, lat2, lon2) => {
  if (!lat1 || !lon1 || !lat2 || !lon2) return Infinity;
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// ─── Stock Status Helpers ─────────────────────────────────────────────────────

const releaseExpiredStockReservations = async () => {
  try {
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("estimated_stock")
      .update({
        status: "OPEN",
        reserved_until: null,
        reserved_for_order: null,
        updated_at: now,
      })
      .eq("status", "RESERVED")
      .lt("reserved_until", now)
      .select("id");
    if (error) {
      console.error("[Stock] Failed to release expired reservations:", error);
      return 0;
    }
    const count = data?.length || 0;
    if (count > 0)
      console.log(`[Stock] Released ${count} expired stock reservations`);
    return count;
  } catch (err) {
    console.error("[Stock] Error releasing expired:", err);
    return 0;
  }
};

const reserveStock = async (stockId, orderId, expiresAt) => {
  try {
    const { data, error } = await supabase
      .from("estimated_stock")
      .update({
        status: "RESERVED",
        reserved_until: expiresAt,
        reserved_for_order: orderId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", stockId)
      .eq("status", "OPEN")
      .select()
      .single();
    if (error || !data) {
      console.error("[Stock] Failed to reserve (may already be taken):", error);
      return null;
    }
    return data;
  } catch (err) {
    console.error("[Stock] Error reserving:", err);
    return null;
  }
};

const releaseStockReservation = async (stockId, orderId) => {
  try {
    const { error } = await supabase
      .from("estimated_stock")
      .update({
        status: "OPEN",
        reserved_until: null,
        reserved_for_order: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", stockId)
      .eq("reserved_for_order", orderId);
    if (error) {
      console.error("[Stock] Failed to release reservation:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[Stock] Error releasing:", err);
    return false;
  }
};

const releaseOrderReservations = async (orderId) => {
  try {
    const { data, error } = await supabase
      .from("estimated_stock")
      .update({
        status: "OPEN",
        reserved_until: null,
        reserved_for_order: null,
        updated_at: new Date().toISOString(),
      })
      .eq("reserved_for_order", orderId)
      .eq("status", "RESERVED")
      .select("id");
    if (error) {
      console.error("[Stock] Failed to release order reservations:", error);
      return 0;
    }
    const count = data?.length || 0;
    if (count > 0)
      console.log(
        `[Stock] Released ${count} reservations for order ${orderId}`,
      );
    return count;
  } catch (err) {
    console.error("[Stock] Error releasing order reservations:", err);
    return 0;
  }
};

const confirmStockMatch = async (stockId, orderId) => {
  try {
    const { data, error } = await supabase
      .from("estimated_stock")
      .update({
        status: "MATCHED",
        reserved_until: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", stockId)
      .eq("reserved_for_order", orderId)
      .select()
      .single();
    if (error || !data) {
      console.error("[Stock] Failed to confirm match:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[Stock] Error confirming:", err);
    return false;
  }
};

// ─── Proposal Helpers ─────────────────────────────────────────────────────────

const createMatchProposal = async ({
  orderId,
  stockId,
  quantityProposed,
  matchScore,
  expiresAt,
  distanceKm,
}) => {
  try {
    const { data, error } = await supabase
      .from("match_proposals")
      .insert({
        order_id: orderId,
        stock_id: stockId,
        quantity_proposed: quantityProposed,
        status: "PENDING_BUYER",
        match_score: matchScore,
        expires_at: expiresAt,
        distance_km: distanceKm ?? null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (error) {
      console.error("[Proposal] Failed to create:", error);
      return null;
    }
    return data;
  } catch (err) {
    console.error("[Proposal] Error creating:", err);
    return null;
  }
};

const releaseExpiredProposals = async () => {
  try {
    const now = new Date().toISOString();
    const { data: expiredProposals, error } = await supabase
      .from("match_proposals")
      .update({ status: "EXPIRED", updated_at: now })
      .in("status", ["PENDING_BUYER", "PENDING_FARMER"])
      .lt("expires_at", now)
      .select("stock_id, order_id");
    if (error) {
      console.error("[Proposal] Failed to expire:", error);
      return [];
    }
    for (const p of expiredProposals || []) {
      await releaseStockReservation(p.stock_id, p.order_id);
    }
    const count = expiredProposals?.length || 0;
    if (count > 0)
      console.log(`[Proposal] Expired ${count} proposals and released stock`);
    return expiredProposals;
  } catch (err) {
    console.error("[Proposal] Error releasing expired:", err);
    return [];
  }
};

const farmerAcceptProposal = async (proposalId) => {
  try {
    const { data: proposal, error: fetchError } = await supabase
      .from("match_proposals")
      .select("order_id, stock_id")
      .eq("id", proposalId)
      .eq("status", "PENDING_FARMER")
      .single();
    if (fetchError || !proposal)
      return {
        success: false,
        error: "Proposal not found or already responded",
      };

    const stockConfirmed = await confirmStockMatch(
      proposal.stock_id,
      proposal.order_id,
    );
    if (!stockConfirmed)
      return { success: false, error: "Failed to confirm stock" };

    const { error: updateError } = await supabase
      .from("match_proposals")
      .update({
        status: "ACCEPTED",
        farmer_response_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", proposalId);
    if (updateError)
      return { success: false, error: "Failed to update proposal" };

    const orderResult = await createOrderFromProposal(proposalId);
    if (!orderResult.success)
      return {
        success: false,
        error:
          "Proposal accepted but failed to create order: " + orderResult.error,
      };

    console.log(
      `[Proposal] Farmer accepted proposal: ${proposalId}, Order created: ${orderResult.orderId}`,
    );
    return { success: true, proposalId, orderId: orderResult.orderId };
  } catch (err) {
    console.error("[Proposal] Error accepting:", err);
    return { success: false, error: err.message };
  }
};

const createOrderFromProposal = async (proposalId) => {
  try {
    const { data: proposal, error: fetchError } = await supabase
      .from("match_proposals")
      .select(
        `
        id, order_id, stock_id, quantity_proposed,
        order:placed_orders!order_id (buyer_id, fruit_type, variant, quantity),
        stock:estimated_stock!stock_id (farmer_id, estimated_harvest_date)
      `,
      )
      .eq("id", proposalId)
      .eq("status", "ACCEPTED")
      .single();
    if (fetchError || !proposal)
      return { success: false, error: "Proposal not found or not accepted" };

    const { data: order, error: insertError } = await supabase
      .from("orders")
      .insert({
        placed_order_id: proposal.order_id,
        buyer_id: proposal.order.buyer_id,
        farmer_id: proposal.stock.farmer_id,
        fruit_type: proposal.order.fruit_type,
        fruit_variant: proposal.order.variant,
        quantity: proposal.quantity_proposed,
        status: "pending",
        pickup_date: proposal.stock.estimated_harvest_date,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (insertError) {
      console.error("[Order] Failed to create:", insertError);
      return { success: false, error: "Failed to create order" };
    }

    const { error: updateError } = await supabase
      .from("placed_orders")
      .update({
        status: "AWAITING_PAYMENT",
        updated_at: new Date().toISOString(),
      })
      .eq("id", proposal.order_id);
    if (updateError)
      console.error("[Order] Failed to update placed_order:", updateError);

    console.log(
      `[Order] Created finalized order: ${order.id} from proposal: ${proposalId}`,
    );
    return { success: true, orderId: order.id };
  } catch (err) {
    console.error("[Order] Error creating from proposal:", err);
    return { success: false, error: err.message };
  }
};

const farmerRejectProposal = async (proposalId) => {
  try {
    const { data: proposal, error: fetchError } = await supabase
      .from("match_proposals")
      .select("order_id, stock_id")
      .eq("id", proposalId)
      .eq("status", "PENDING_FARMER")
      .single();
    if (fetchError || !proposal)
      return {
        success: false,
        error: "Proposal not found or already responded",
      };

    await releaseStockReservation(proposal.stock_id, proposal.order_id);

    const { error: updateError } = await supabase
      .from("match_proposals")
      .update({
        status: "REJECTED",
        farmer_response_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", proposalId);
    if (updateError)
      return { success: false, error: "Failed to update proposal" };

    console.log(`[Proposal] Farmer rejected proposal: ${proposalId}`);
    return { success: true, proposalId };
  } catch (err) {
    console.error("[Proposal] Error rejecting:", err);
    return { success: false, error: err.message };
  }
};

// ─── Core Matching Algorithm ──────────────────────────────────────────────────

const runMatchingAlgorithm = async (orderId) => {
  console.log(`[Matching] Starting algorithm for Order ID: ${orderId}`);
  try {
    // Step 0: Release expired reservations and proposals
    await releaseExpiredStockReservations();
    await releaseExpiredProposals();

    // Step 1: Fetch Order
    const { data: order, error: orderError } = await supabase
      .from("placed_orders")
      .select("*")
      .eq("id", orderId)
      .single();
    if (orderError || !order) throw new Error("Order not found");

    console.log(`[Matching] Order:`, {
      fruit_type: order.fruit_type,
      variant: order.variant,
      grade: order.grade,
      quantity: order.quantity,
      required_date: order.required_date,
      buyer_location: { lat: order.latitude, lon: order.longitude },
    });

    // Step 2: Fetch eligible OPEN stocks
    const { data: pool, error: poolError } = await supabase
      .from("estimated_stock")
      .select(
        `
        id,
        quantity,
        grade,
        estimated_harvest_date,
        status,
        farmer:farmers!farmer_id (
          user_id,
          reputation,
          latitude,
          longitude,
          location
        )
      `,
      )
      .eq("fruit_type", order.fruit_type)
      .eq("variant", order.variant)
      // grade is scored (not hard-filtered) so same OR higher grade stocks are considered
      .eq("status", "OPEN")
      .lte("estimated_harvest_date", order.required_date)
      .gte("quantity", 1);

    if (poolError) throw new Error(poolError.message);
    if (!pool || pool.length === 0) {
      console.log("[Matching] ❌ No eligible OPEN stocks found.");
      return [];
    }

    console.log(`[Matching] ✅ Found ${pool.length} OPEN stocks for matching.`);

    // Step 3: Prepare Candidates (filter out stocks whose grade is below required)
    const candidates = pool
      .map((item) => ({
        stock_id: item.id,
        farmer_id: item.farmer.user_id,
        available_qty: item.quantity,
        grade: item.grade,
        estimated_harvest_date: item.estimated_harvest_date,
        reputation: item.farmer.reputation ?? 2.5,
        lat: item.farmer.latitude,
        lon: item.farmer.longitude,
        location: item.farmer.location,
        locationScore: 0,
        dateScore: 0,
        qtyScore: 0,
        gradeScore: 0,
        finalScore: 0,
      }))
      .filter((c) => getGradeScore(c.grade, order.grade) > 0); // drop sub-grade stocks

    if (candidates.length === 0) {
      console.log("[Matching] ❌ No stocks meet or exceed the required grade.");
      return [];
    }

    // Step 4: Score each candidate
    const orderRequiredDate = new Date(order.required_date);

    console.log(
      `[Matching] Order delivery coords: lat=${order.latitude}, lon=${order.longitude}`,
    );

    candidates.forEach((c) => {
      // 4a. Distance Score — farmer → buyer delivery location (closer = higher)
      console.log(
        `[Matching] Farmer ${c.farmer_id} coords: lat=${c.lat}, lon=${c.lon}`,
      );
      const distKm = getDistanceKm(
        c.lat,
        c.lon,
        order.latitude,
        order.longitude,
      );
      c.distanceKm = distKm === Infinity ? null : parseFloat(distKm.toFixed(1));
      console.log(
        `[Matching] Calculated distanceKm=${c.distanceKm} (raw=${distKm})`,
      );
      c.locationScore =
        distKm === Infinity ? 0 : Math.max(0, 1 - distKm / MAX_DISTANCE_KM);

      // 4b. Date Score — how close harvest date is to required date (closer = higher)
      const harvestDate = new Date(c.estimated_harvest_date);
      const daysDiff = Math.max(
        0,
        (orderRequiredDate - harvestDate) / (1000 * 60 * 60 * 24),
      );
      c.dateScore = Math.max(0, 1 - daysDiff / MAX_DAYS_WINDOW);

      // 4c. Quantity Score — how fully this stock covers the order
      c.qtyScore = Math.min(c.available_qty, order.quantity) / order.quantity;

      // 4d. Grade/Quality Score — exact match = 1.0, higher grade = 0.7
      c.gradeScore = getGradeScore(c.grade, order.grade);
    });

    // Step 5: Final Score
    candidates.forEach((c) => {
      const repScore = c.reputation / 5; // normalise 0–5 → 0–1
      c.finalScore =
        W_LOC * c.locationScore +
        W_REP * repScore +
        W_DATE * c.dateScore +
        W_QTY * c.qtyScore +
        W_QUALITY * c.gradeScore;
    });

    // Sort best → worst
    candidates.sort((a, b) => b.finalScore - a.finalScore);

    console.log(
      "[Matching] Top candidates:",
      candidates.slice(0, 3).map((c) => ({
        stock_id: c.stock_id.substring(0, 8) + "…",
        grade: c.grade,
        distanceKm: c.distanceKm,
        locationScore: c.locationScore.toFixed(2),
        gradeScore: c.gradeScore.toFixed(2),
        dateScore: c.dateScore.toFixed(2),
        qtyScore: c.qtyScore.toFixed(2),
        repScore: (c.reputation / 5).toFixed(2),
        finalScore: c.finalScore.toFixed(2),
      })),
    );

    // Step 6: Reserve stock and create proposals
    let remainingQty = order.quantity;
    const fulfillmentPlan = [];
    const reservationExpiry = new Date(
      Date.now() + RESERVATION_EXPIRY_MINUTES * 60 * 1000,
    ).toISOString();

    for (const candidate of candidates) {
      if (remainingQty <= 0) break;

      const takeQty = Math.min(remainingQty, candidate.available_qty);
      const reserved = await reserveStock(
        candidate.stock_id,
        order.id,
        reservationExpiry,
      );
      if (!reserved) {
        console.log(
          `[Matching] Stock ${candidate.stock_id} already reserved, skipping.`,
        );
        continue;
      }

      const proposal = await createMatchProposal({
        orderId: order.id,
        stockId: candidate.stock_id,
        quantityProposed: takeQty,
        matchScore: candidate.finalScore,
        expiresAt: reservationExpiry,
        distanceKm: candidate.distanceKm,
      });

      if (!proposal) {
        await releaseStockReservation(candidate.stock_id, order.id);
        continue;
      }

      fulfillmentPlan.push({
        proposal_id: proposal.id,
        order_id: order.id,
        stock_id: candidate.stock_id,
        farmer_id: candidate.farmer_id,
        quantity_allocated: takeQty,
        match_score: candidate.finalScore,
        distance_km: candidate.distanceKm,
        farmer_lat: candidate.lat,
        farmer_lon: candidate.lon,
        farmer_location: candidate.location,
        farmer_reputation: candidate.reputation,
        estimated_harvest_date: candidate.estimated_harvest_date,
        proposal_expires_at: reservationExpiry,
        stock_grade: candidate.grade,
        score_breakdown: {
          locationScore: parseFloat(candidate.locationScore.toFixed(3)),
          reputationScore: parseFloat((candidate.reputation / 5).toFixed(3)),
          dateScore: parseFloat(candidate.dateScore.toFixed(3)),
          qtyScore: parseFloat(candidate.qtyScore.toFixed(3)),
          gradeScore: parseFloat(candidate.gradeScore.toFixed(3)),
        },
      });

      remainingQty -= takeQty;
    }

    if (remainingQty > 0) {
      console.log(
        `[Matching] ⚠️  Order ${orderId} partially fulfilled. Remaining: ${remainingQty} units`,
      );
    }

    console.log(
      `[Matching] ✅ Created ${fulfillmentPlan.length} proposals for Order ${orderId}`,
    );
    return fulfillmentPlan;
  } catch (err) {
    console.error("[Matching] Algorithm failed:", err);
    return [];
  }
};

// ─── Batch & Event Triggers ───────────────────────────────────────────────────

const runBatchMatching = async () => {
  console.log(`[Batch Matching] Starting at ${new Date().toISOString()}`);
  try {
    await releaseExpiredStockReservations();
    await releaseExpiredProposals();

    const { data: openOrders, error } = await supabase
      .from("placed_orders")
      .select("id, required_date, created_at")
      .eq("status", "OPEN")
      .gte("required_date", new Date().toISOString().split("T")[0])
      .order("created_at", { ascending: true });

    if (error) throw new Error(error.message);
    if (!openOrders || openOrders.length === 0) {
      console.log("[Batch Matching] No open orders.");
      return { processed: 0, matched: 0 };
    }

    let matchedCount = 0;
    for (const order of openOrders) {
      const result = await runMatchingAlgorithm(order.id);
      if (result.length > 0) {
        matchedCount++;
        await supabase
          .from("placed_orders")
          .update({
            status: "PENDING_FARMER",
            updated_at: new Date().toISOString(),
          })
          .eq("id", order.id);
      }
    }

    console.log(
      `[Batch Matching] Done. Matched: ${matchedCount}/${openOrders.length}`,
    );
    return { processed: openOrders.length, matched: matchedCount };
  } catch (err) {
    console.error("[Batch Matching] Failed:", err);
    return { processed: 0, matched: 0, error: err.message };
  }
};

const onNewStockAdded = async (stockId) => {
  console.log(`[Stock Event] New stock added: ${stockId}`);
  try {
    const { data: stock, error } = await supabase
      .from("estimated_stock")
      .select("fruit_type, variant, grade, estimated_harvest_date")
      .eq("id", stockId)
      .single();
    if (error || !stock) {
      console.log("[Stock Event] Could not fetch stock.");
      return;
    }

    // Find all grades this stock can serve:
    //   Grade A stock → can fill A, B, or C orders
    //   Grade B stock → can fill B or C orders
    //   Grade C stock → can only fill C orders
    const stockRank = GRADE_RANK[stock.grade] ?? 1;
    const eligibleOrderGrades = Object.entries(GRADE_RANK)
      .filter(([, rank]) => rank <= stockRank)
      .map(([grade]) => grade); // grades whose rank ≤ stock rank

    console.log(
      `[Stock Event] Grade ${stock.grade} stock can serve orders: ${eligibleOrderGrades.join(", ")}`,
    );

    const { data: matchingOrders, error: ordersError } = await supabase
      .from("placed_orders")
      .select("id")
      .eq("status", "OPEN")
      .eq("fruit_type", stock.fruit_type)
      .eq("variant", stock.variant)
      .in("grade", eligibleOrderGrades)
      .gte("required_date", stock.estimated_harvest_date)
      .order("created_at", { ascending: true });

    if (ordersError || !matchingOrders?.length) {
      console.log("[Stock Event] No matching orders.");
      return;
    }

    for (const order of matchingOrders) {
      const result = await runMatchingAlgorithm(order.id);
      if (result.length > 0) {
        await supabase
          .from("placed_orders")
          .update({
            status: "PENDING_FARMER",
            updated_at: new Date().toISOString(),
          })
          .eq("id", order.id);
      }
    }
    console.log("[Stock Event] Matching completed.");
  } catch (err) {
    console.error("[Stock Event] Failed:", err);
  }
};

const markExpiredOrders = async () => {
  console.log(`[Expiry Check] Running at ${new Date().toISOString()}`);
  try {
    const today = new Date().toISOString().split("T")[0];
    const { data: expiredOrders, error: fetchError } = await supabase
      .from("placed_orders")
      .select("id")
      .eq("status", "OPEN")
      .lt("required_date", today);

    if (fetchError) throw new Error(fetchError.message);
    for (const order of expiredOrders || [])
      await releaseOrderReservations(order.id);

    const { data: updated, error } = await supabase
      .from("placed_orders")
      .update({ status: "EXPIRED", updated_at: new Date().toISOString() })
      .eq("status", "OPEN")
      .lt("required_date", today)
      .select("id");

    if (error) throw new Error(error.message);
    const count = updated?.length || 0;
    console.log(`[Expiry Check] Marked ${count} orders as expired.`);
    return { expired: count };
  } catch (err) {
    console.error("[Expiry Check] Failed:", err);
    return { expired: 0, error: err.message };
  }
};

// ─── Exports ──────────────────────────────────────────────────────────────────
module.exports = {
  runMatchingAlgorithm,
  runBatchMatching,
  onNewStockAdded,
  markExpiredOrders,
  releaseExpiredStockReservations,
  releaseOrderReservations,
  confirmStockMatch,
  releaseStockReservation,
  createMatchProposal,
  releaseExpiredProposals,
  farmerAcceptProposal,
  farmerRejectProposal,
  createOrderFromProposal,
};
