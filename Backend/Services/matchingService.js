const { supabase } = require("../utils/supabaseClient");

// Configurable Weights (Location-focused)
const W_LOC = 0.7; // Location Weight (70%)
const W_REP = 0.3; // Reputation Weight (30%)

// Reservation expiry time (in minutes) - reservations older than this are released
const RESERVATION_EXPIRY_MINUTES = 24 * 60; // 24 hours

// ============ Stock Status Management ============
// Stock statuses: OPEN, RESERVED, MATCHED

// Helper: Release expired stock reservations (set back to OPEN)
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

    const count = data ? data.length : 0;
    if (count > 0) {
      console.log(`[Stock] Released ${count} expired stock reservations`);
    }
    return count;
  } catch (err) {
    console.error("[Stock] Error releasing expired:", err);
    return 0;
  }
};

// Helper: Reserve stock for an order (OPEN -> RESERVED)
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
      .eq("status", "OPEN") // Only reserve if currently OPEN (prevents race conditions)
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

// Helper: Create match proposal
const createMatchProposal = async ({
  orderId,
  stockId,
  quantityProposed,
  matchScore,
  expiresAt,
}) => {
  try {
    const { data, error } = await supabase
      .from("match_proposals")
      .insert({
        order_id: orderId,
        stock_id: stockId,
        quantity_proposed: quantityProposed,
        status: "PENDING_BUYER", // Initial status - waiting for buyer approval
        match_score: matchScore,
        expires_at: expiresAt,
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

// Helper: Release expired match proposals
const releaseExpiredProposals = async () => {
  try {
    const now = new Date().toISOString();

    const { data: expiredProposals, error: updateError } = await supabase
      .from("match_proposals")
      .update({
        status: "EXPIRED",
        updated_at: now,
      })
      .in("status", ["PENDING_BUYER", "PENDING_FARMER"]) // Expire both pending statuses
      .lt("expires_at", now)
      .select("stock_id, order_id");

    if (updateError) {
      console.error("[Proposal] Failed to expire:", updateError);
      return [];
    }

    // Release stock reservations for expired proposals
    for (const proposal of expiredProposals || []) {
      await releaseStockReservation(proposal.stock_id, proposal.order_id);
    }

    const count = expiredProposals ? expiredProposals.length : 0;
    if (count > 0) {
      console.log(`[Proposal] Expired ${count} proposals and released stock`);
    }
    return expiredProposals;
  } catch (err) {
    console.error("[Proposal] Error releasing expired:", err);
    return [];
  }
};

// Helper: Confirm stock match (RESERVED -> MATCHED)
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

// Helper: Farmer accepts proposal
const farmerAcceptProposal = async (proposalId) => {
  try {
    // Get proposal details
    const { data: proposal, error: fetchError } = await supabase
      .from("match_proposals")
      .select("order_id, stock_id")
      .eq("id", proposalId)
      .eq("status", "PENDING_FARMER")
      .single();

    if (fetchError || !proposal) {
      return {
        success: false,
        error: "Proposal not found or already responded",
      };
    }

    // Confirm stock match
    const stockConfirmed = await confirmStockMatch(
      proposal.stock_id,
      proposal.order_id
    );
    if (!stockConfirmed) {
      return { success: false, error: "Failed to confirm stock" };
    }

    // Update proposal status
    const { error: updateError } = await supabase
      .from("match_proposals")
      .update({
        status: "ACCEPTED",
        farmer_response_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", proposalId);

    if (updateError) {
      return { success: false, error: "Failed to update proposal" };
    }

    // Create order from accepted proposal
    const orderResult = await createOrderFromProposal(proposalId);
    if (!orderResult.success) {
      return {
        success: false,
        error:
          "Proposal accepted but failed to create order: " + orderResult.error,
      };
    }

    console.log(
      `[Proposal] Farmer accepted proposal: ${proposalId}, Order created: ${orderResult.orderId}`
    );
    return { success: true, proposalId, orderId: orderResult.orderId };
  } catch (err) {
    console.error("[Proposal] Error accepting:", err);
    return { success: false, error: err.message };
  }
};

// Helper: Create order from accepted proposal
const createOrderFromProposal = async (proposalId) => {
  try {
    // Get proposal with order and stock details
    const { data: proposal, error: fetchError } = await supabase
      .from("match_proposals")
      .select(
        `
        id,
        order_id,
        stock_id,
        quantity_proposed,
        order:order_id (buyer_id, fruit_type, variant, quantity),
        stock:stock_id (farmer_id, estimated_harvest_date)
      `
      )
      .eq("id", proposalId)
      .eq("status", "ACCEPTED")
      .single();

    if (fetchError || !proposal) {
      return { success: false, error: "Proposal not found or not accepted" };
    }

    // Create finalized order
    const { data: order, error: insertError } = await supabase
      .from("orders")
      .insert({
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

    // Update placed_order status to CONFIRMED
    const { error: updateError } = await supabase
      .from("placed_orders")
      .update({
        status: "CONFIRMED",
        updated_at: new Date().toISOString(),
      })
      .eq("id", proposal.order_id);

    if (updateError) {
      console.error("[Order] Failed to update placed_order:", updateError);
    }

    console.log(
      `[Order] Created finalized order: ${order.id} from proposal: ${proposalId}`
    );
    return { success: true, orderId: order.id };
  } catch (err) {
    console.error("[Order] Error creating from proposal:", err);
    return { success: false, error: err.message };
  }
};

// Helper: Farmer rejects proposal
const farmerRejectProposal = async (proposalId) => {
  try {
    // Get proposal details
    const { data: proposal, error: fetchError } = await supabase
      .from("match_proposals")
      .select("order_id, stock_id")
      .eq("id", proposalId)
      .eq("status", "PENDING_FARMER")
      .single();

    if (fetchError || !proposal) {
      return {
        success: false,
        error: "Proposal not found or already responded",
      };
    }

    // Release stock reservation
    await releaseStockReservation(proposal.stock_id, proposal.order_id);

    // Update proposal status
    const { error: updateError } = await supabase
      .from("match_proposals")
      .update({
        status: "REJECTED",
        farmer_response_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", proposalId);

    if (updateError) {
      return { success: false, error: "Failed to update proposal" };
    }

    console.log(`[Proposal] Farmer rejected proposal: ${proposalId}`);
    return { success: true, proposalId };
  } catch (err) {
    console.error("[Proposal] Error rejecting:", err);
    return { success: false, error: err.message };
  }
};

// Helper: Release a single stock reservation (RESERVED -> OPEN)
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

// Helper: Release all reservations for an order
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

    const count = data ? data.length : 0;
    if (count > 0) {
      console.log(
        `[Stock] Released ${count} reservations for order ${orderId}`
      );
    }
    return count;
  } catch (err) {
    console.error("[Stock] Error releasing order reservations:", err);
    return 0;
  }
};

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
    // --- Step 0: Release any expired reservations and proposals ---
    await releaseExpiredStockReservations();
    await releaseExpiredProposals();

    // --- Step 1: Data Ingestion (Fetch Order) ---
    const { data: order, error: orderError } = await supabase
      .from("placed_orders")
      .select("*")
      .eq("id", orderId)
      .single();

    if (orderError || !order) throw new Error("Order not found");

    console.log(`[Matching] Order details:`, {
      fruit_type: order.fruit_type,
      variant: order.variant,
      grade: order.grade,
      quantity: order.quantity,
      required_date: order.required_date,
      buyer_location: { lat: order.latitude, lon: order.longitude },
    });

    // --- Step 2: Debug - Check ALL stocks first (ignoring filters) ---
    const { data: allStocks, error: allStocksError } = await supabase
      .from("estimated_stock")
      .select(
        "id, fruit_type, variant, grade, quantity, status, estimated_harvest_date, farmer_id"
      );

    console.log(`[Matching] Total stocks in DB: ${allStocks?.length || 0}`);
    if (allStocks && allStocks.length > 0) {
      console.log(
        `[Matching] Sample stocks:`,
        allStocks.slice(0, 5).map((s) => ({
          id: s.id.substring(0, 8) + "...",
          fruit_type: s.fruit_type,
          variant: s.variant,
          grade: s.grade,
          status: s.status,
          qty: s.quantity,
          harvest_date: s.estimated_harvest_date,
        }))
      );
    }

    // --- Step 2a: Check stocks matching fruit_type only ---
    const { data: fruitMatch } = await supabase
      .from("estimated_stock")
      .select("id, variant, grade, status, quantity, estimated_harvest_date")
      .eq("fruit_type", order.fruit_type);
    console.log(
      `[Matching] Stocks matching fruit_type '${order.fruit_type}': ${
        fruitMatch?.length || 0
      }`
    );

    // --- Step 2b: Check stocks matching fruit_type + variant ---
    const { data: variantMatch } = await supabase
      .from("estimated_stock")
      .select("id, grade, status, quantity, estimated_harvest_date")
      .eq("fruit_type", order.fruit_type)
      .eq("variant", order.variant);
    console.log(
      `[Matching] + variant '${order.variant}': ${variantMatch?.length || 0}`
    );

    // --- Step 2c: Check stocks matching fruit_type + variant + grade ---
    const { data: gradeMatch } = await supabase
      .from("estimated_stock")
      .select("id, status, quantity, estimated_harvest_date")
      .eq("fruit_type", order.fruit_type)
      .eq("variant", order.variant)
      .eq("grade", order.grade);
    console.log(
      `[Matching] + grade '${order.grade}': ${gradeMatch?.length || 0}`
    );

    // --- Step 2d: Check OPEN status ---
    const { data: statusMatch } = await supabase
      .from("estimated_stock")
      .select("id, quantity, estimated_harvest_date")
      .eq("fruit_type", order.fruit_type)
      .eq("variant", order.variant)
      .eq("grade", order.grade)
      .eq("status", "OPEN");
    console.log(`[Matching] + status 'OPEN': ${statusMatch?.length || 0}`);
    if (gradeMatch && statusMatch && gradeMatch.length !== statusMatch.length) {
      console.log(
        `[Matching] ⚠️ ${
          gradeMatch.length - statusMatch.length
        } stocks are NOT OPEN (RESERVED/MATCHED)`
      );
    }

    // --- Step 2e: Check harvest date ---
    const { data: dateMatch } = await supabase
      .from("estimated_stock")
      .select("id, quantity, estimated_harvest_date")
      .eq("fruit_type", order.fruit_type)
      .eq("variant", order.variant)
      .eq("grade", order.grade)
      .eq("status", "OPEN")
      .lte("estimated_harvest_date", order.required_date);
    console.log(
      `[Matching] + harvest_date <= '${order.required_date}': ${
        dateMatch?.length || 0
      }`
    );
    if (statusMatch && dateMatch && statusMatch.length !== dateMatch.length) {
      console.log(
        `[Matching] ⚠️ ${
          statusMatch.length - dateMatch.length
        } stocks have harvest_date AFTER required_date`
      );
      statusMatch?.forEach((s) => {
        if (!dateMatch?.find((d) => d.id === s.id)) {
          console.log(
            `[Matching]    - Stock ${s.id.substring(0, 8)}... harvest: ${
              s.estimated_harvest_date
            }, required: ${order.required_date}`
          );
        }
      });
    }

    // --- Step 2 Final: Get ONLY OPEN Stocks with full data ---
    const { data: pool, error: poolError } = await supabase
      .from("estimated_stock")
      .select(
        `
        id,
        quantity,
        grade,
        estimated_harvest_date,
        status,
        farmer:farmer_id (
          id,
          reputation,
          latitude,
          longitude,
          user:user_id (
            id,
            name,
            email,
            phone
          )
        )
      `
      )
      .eq("fruit_type", order.fruit_type)
      .eq("variant", order.variant)
      .eq("grade", order.grade) // Hard constraint: exact grade match
      .eq("status", "OPEN") // Only OPEN stocks - excludes RESERVED and MATCHED
      .lte("estimated_harvest_date", order.required_date) // Farmer can harvest before buyer needs
      .gte("quantity", 1); // Has stock available

    if (poolError) throw new Error(poolError.message);
    if (!pool || pool.length === 0) {
      console.log(
        "[Matching] ❌ No eligible OPEN stocks found after all filters."
      );
      console.log(
        "[Matching] Summary: Check fruit_type, variant, grade, status, and harvest_date"
      );
      return [];
    }

    console.log(`[Matching] ✅ Found ${pool.length} OPEN stocks for matching.`);

    // --- Step 3: Prepare Candidates ---
    const candidates = pool.map((item) => ({
      stock_id: item.id,
      farmer_id: item.farmer.id,
      available_qty: item.quantity,
      estimated_harvest_date: item.estimated_harvest_date,
      reputation: item.farmer.reputation || 2.5, // Default neutral reputation
      lat: item.farmer.latitude,
      lon: item.farmer.longitude,
      // Farmer user details
      farmer_name: item.farmer.user?.name || null,
      farmer_email: item.farmer.user?.email || null,
      farmer_phone: item.farmer.user?.phone || null,
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
          if (dist <= 100) neighbors++; // 100km cluster radius
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

    // --- Step 6: Aggregation Loop with Stock Reservation ---
    let remainingQty = order.quantity;
    const fulfillmentPlan = [];

    // Calculate reservation expiry time
    const reservationExpiry = new Date(
      Date.now() + RESERVATION_EXPIRY_MINUTES * 60 * 1000
    ).toISOString();

    for (const candidate of candidates) {
      if (remainingQty <= 0) break;

      const takeQty = Math.min(remainingQty, candidate.available_qty);

      // Reserve this stock - changes status from OPEN to RESERVED
      const reserved = await reserveStock(
        candidate.stock_id,
        order.id,
        reservationExpiry
      );

      if (!reserved) {
        // Stock was already taken by another order (race condition handled)
        console.log(
          `[Matching] Stock ${candidate.stock_id} already reserved by another order, skipping.`
        );
        continue;
      }

      // Create match proposal
      const proposal = await createMatchProposal({
        orderId: order.id,
        stockId: candidate.stock_id,
        quantityProposed: takeQty,
        matchScore: candidate.finalScore,
        expiresAt: reservationExpiry,
      });

      if (!proposal) {
        // Failed to create proposal, release the reservation
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
        farmer_lat: candidate.lat,
        farmer_lon: candidate.lon,
        farmer_reputation: candidate.reputation,
        // Farmer details from users table
        farmer_name: candidate.farmer_name,
        farmer_email: candidate.farmer_email,
        farmer_phone: candidate.farmer_phone,
        estimated_harvest_date: candidate.estimated_harvest_date,
        proposal_expires_at: reservationExpiry,
      });

      remainingQty -= takeQty;
    }

    // NOTE: Proposals are now saved to match_proposals table.
    // Buyer sees these proposals and waits for farmer response.
    // Farmer can accept/reject via farmerAcceptProposal() or farmerRejectProposal().

    if (remainingQty > 0) {
      console.log(
        `[Matching] Warning: Order ${orderId} can only be partially fulfilled. Remaining: ${remainingQty} units`
      );
    }

    console.log(
      `[Matching] Created ${fulfillmentPlan.length} proposals for Order ${orderId}`
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
    // Release expired reservations and proposals first
    await releaseExpiredStockReservations();
    await releaseExpiredProposals();

    // Get all OPEN orders that haven't been fully matched and not expired
    // Sorted by created_at for first-come-first-served priority
    const { data: openOrders, error: ordersError } = await supabase
      .from("placed_orders")
      .select("id, required_date, created_at")
      .eq("status", "OPEN")
      .gte("required_date", new Date().toISOString().split("T")[0]) // Not expired
      .order("created_at", { ascending: true }); // FIFO: First-come-first-served

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
        // Update order status to PENDING_FARMER (waiting for farmer response)
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
    // Sorted by created_at for FIFO priority
    const { data: matchingOrders, error: ordersError } = await supabase
      .from("placed_orders")
      .select("id")
      .eq("status", "OPEN")
      .eq("fruit_type", stock.fruit_type)
      .eq("variant", stock.variant)
      .eq("grade", stock.grade)
      .gte("required_date", stock.estimated_harvest_date) // Buyer needs it after harvest date
      .order("created_at", { ascending: true }); // FIFO: First-come-first-served

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
            status: "PENDING_FARMER",
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

// Mark expired orders and release their stock reservations
const markExpiredOrders = async () => {
  console.log(`[Expiry Check] Running at ${new Date().toISOString()}`);

  try {
    const today = new Date().toISOString().split("T")[0];

    // First, get the expired orders to release their reservations
    const { data: expiredOrders, error: fetchError } = await supabase
      .from("placed_orders")
      .select("id")
      .eq("status", "OPEN")
      .lt("required_date", today);

    if (fetchError) throw new Error(fetchError.message);

    // Release stock reservations for each expired order
    for (const order of expiredOrders || []) {
      await releaseOrderReservations(order.id);
    }

    // Update order status to EXPIRED
    const { data: updated, error } = await supabase
      .from("placed_orders")
      .update({ status: "EXPIRED", updated_at: new Date().toISOString() })
      .eq("status", "OPEN")
      .lt("required_date", today)
      .select("id");

    if (error) throw new Error(error.message);

    const count = updated ? updated.length : 0;
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
  // Stock status management
  releaseExpiredStockReservations,
  releaseOrderReservations,
  confirmStockMatch,
  releaseStockReservation,
  // Match proposals & orders
  createMatchProposal,
  releaseExpiredProposals,
  farmerAcceptProposal,
  farmerRejectProposal,
  createOrderFromProposal,
};
