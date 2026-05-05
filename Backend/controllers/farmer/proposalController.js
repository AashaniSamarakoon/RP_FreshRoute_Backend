const { supabaseAdmin: supabase } = require("../../utils/supabaseClient");
const { calculateDistanceKm } = require("../../utils/logisticsUtils");
const { fetchUnitPrice, calculatePrice, calculateFarmerPrice } = require("../../utils/pricingUtils");
const { getContract } = require("../../Services/blockchain/contractService");
const { submitWithTx } = require("../../utils/blockchainUtils");
const { sendSystemNotification } = require("../../Services/notificationsService");

// ─── Farmer-side proposal pricing ────────────────────────────────────────────
// Uses farmer-specific breakdown: no delivery fee, 1.4% platform deduction.
async function attachFarmerPricing(proposals) {
  const today = new Date().toISOString().split("T")[0];
  return Promise.all(
    (proposals || []).map(async (p) => {
      // Prefer the price the farmer actually set; fall back to market price.
      let unitPrice = p.stock?.price_per_kg > 0 ? p.stock.price_per_kg : null;
      let priceSource = unitPrice != null ? "farmer" : null;

      if (unitPrice == null) {
        const fruit   = p.order?.fruit_type;
        const variant = p.order?.variant;
        const grade   = p.order?.grade;
        if (fruit && variant && grade) {
          unitPrice   = await fetchUnitPrice(fruit, variant, grade, today);
          priceSource = unitPrice != null ? "market" : null;
        }
      }

      const breakdown = calculateFarmerPrice(
        { quantity: p.quantity_proposed ?? 0 },
        unitPrice,
      );

      return { ...p, pricing: { ...breakdown, priceSource } };
    }),
  );
}

// Helper: Get farmer ID from user ID
// farmer table only stores user_id; this returns the UUID directly.
const getFarmerId = async (userId) => {
  const { data: farmerData, error: farmerError } = await supabase
    .from("farmers")
    .select("user_id")
    .eq("user_id", userId)
    .single();

  if (farmerError || !farmerData) {
    throw new Error("No farmer profile found.");
  }
  return farmerData.user_id;
};

// GET: View all pending proposals for this farmer
const getProposals = async (req, res) => {
  try {
    const userId = req.user.id;
    const farmerId = await getFarmerId(userId);

    // First, get all stocks that belong to this farmer
    const { data: farmerStocks, error: stockError } = await supabase
      .from("estimated_stock")
      .select("id")
      .eq("farmer_id", farmerId);

    if (stockError) throw new Error(stockError.message);

    if (!farmerStocks || farmerStocks.length === 0) {
      return res.status(200).json({
        message: "Found 0 pending proposals",
        proposals: [],
      });
    }

    const stockIds = farmerStocks.map((stock) => stock.id);

    // Now get proposals for these stocks
    const { data: proposals, error } = await supabase
      .from("match_proposals")
      .select(
        `
        id,
        order_id,
        stock_id,
        quantity_proposed,
        status,
        expires_at,
        created_at,
        stock:estimated_stock!stock_id (
          id,
          quantity,
          price_per_kg,
          fruit_type,
          variant,
          image_url
        ),
        order:placed_orders!order_id (
          fruit_type,
          variant,
          grade,
          quantity,
          required_date,
          delivery_location,
          buyer:buyers!buyer_id (
            user_id,
            company_name,
            user:users!user_id (
              first_name,
              last_name,
              email
            )
          )
        )
      `,
      )
      .in("stock_id", stockIds)
      .eq("status", "PENDING_FARMER")
      .gte("expires_at", new Date().toISOString()) // Not expired
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);

    const enriched = await attachFarmerPricing(proposals);

    return res.status(200).json({
      message: `Found ${enriched.length} pending proposals`,
      proposals: enriched,
    });
  } catch (err) {
    console.error("GetProposals Error:", err);
    return res
      .status(500)
      .json({ message: "Server error", error: err.message });
  }
};

// POST: Farmer accepts a proposal
const acceptProposal = async (req, res) => {
  try {
    const userId = req.user.id;
    const { proposalId } = req.params;

    const farmerId = await getFarmerId(userId);

    // 1. Get proposal and verify ownership
    const { data: proposal, error: proposalError } = await supabase
      .from("match_proposals")
      .select(
        "*, order:placed_orders!order_id(*), stock:estimated_stock!stock_id(farmer_id)",
      )
      .eq("id", proposalId)
      .eq("status", "PENDING_FARMER")
      .single();

    if (proposalError || !proposal) {
      return res
        .status(404)
        .json({ message: "Proposal not found or already processed" });
    }

    // Verify the stock belongs to this farmer
    if (proposal.stock.farmer_id !== farmerId) {
      return res
        .status(403)
        .json({ message: "You don't have permission to accept this proposal" });
    }

    // Check if expired
    if (new Date(proposal.expires_at) < new Date()) {
      return res.status(400).json({ message: "Proposal has expired" });
    }

    // 2. Verify stock is still available
    const { data: stock, error: stockError } = await supabase
      .from("estimated_stock")
      .select("id, quantity")
      .eq("id", proposal.stock_id)
      .single();

    if (stockError || !stock || stock.quantity < proposal.quantity_proposed) {
      return res.status(400).json({ message: "Insufficient stock available" });
    }

    // 3. Compute pricing (needed for both blockchain and DB update)
    const { data: orderRow } = await supabase
      .from("placed_orders")
      .select("*")
      .eq("id", proposal.order_id)
      .single();
    let distance = 0;
    if (orderRow) {
      const { data: farmerInfo } = await supabase
        .from("farmers")
        .select("latitude, longitude")
        .eq("user_id", farmerId)
        .single();
      if (
        farmerInfo &&
        orderRow.latitude != null &&
        orderRow.longitude != null
      ) {
        distance = calculateDistanceKm(
          orderRow.latitude,
          orderRow.longitude,
          farmerInfo.latitude,
          farmerInfo.longitude,
        );
      }
    }
    const unit = await fetchUnitPrice(
      orderRow.fruit_type,
      orderRow.variant,
      orderRow.grade,
      new Date().toISOString().split("T")[0],
    );
    const breakdown = calculatePrice(
      { quantity: proposal.quantity_proposed, distance_km: distance },
      unit,
    );
    const totalAmount = breakdown.totalPrice;

    // 4. Record accepted deal on-chain (farmer identity signs the immutable contract record)
    let blockchainStatus = "Skipped";
    try {
      const unitForChain = unit != null ? unit.toString() : "0";
      const { contract, close } = await getContract(userId, "OrderContract");
      const txId = await submitWithTx(
        contract,
        "RegisterAcceptedDeal",
        `PROPOSAL_${proposalId}`,
        `ORDER_${proposal.order_id}`,
        `HARVEST_${proposal.stock_id}`,
        proposal.quantity_proposed.toString(),
        unitForChain,
      );
      await close();
      blockchainStatus = "Success";
      console.log(`[Blockchain] RegisterAcceptedDeal Success: PROPOSAL_${proposalId} tx=${txId}`);
      if (txId) {
        // persist to match_proposals row (append to array)
        try {
          const { data: existing } = await supabase
            .from("match_proposals")
            .select("blockchain_tx_id")
            .eq("id", proposalId)
            .single();
          const arrExisting = existing?.blockchain_tx_id || [];
          const arr = Array.isArray(arrExisting) ? arrExisting : [arrExisting];
          await supabase
            .from("match_proposals")
            .update({ blockchain_tx_id: [...arr, txId] })
            .eq("id", proposalId);
        } catch (_e) {
          console.warn(
            "Failed to save blockchain txId for proposal",
            proposalId,
            _e.message,
          );
        }
      }
    } catch (bcErr) {
      // ledger call failed – log and allow the workflow to continue with a failed status
      blockchainStatus = "Failed";
      console.error(
        `[Blockchain] RegisterAcceptedDeal Failed: PROPOSAL_${proposalId}`,
        bcErr.message,
      );
    }

    // 5. Update proposal status (triggers will handle order/stock status updates)
    await supabase
      .from("match_proposals")
      .update({
        status: "ACCEPTED",
        farmer_response_at: new Date().toISOString(),
      })
      .eq("id", proposalId);

    // also stamp the order row so we know when farmer accepted
    await supabase
      .from("placed_orders")
      .update({ farmer_accepted_at: new Date().toISOString() })
      .eq("id", proposal.order_id);

    // Note: Stock status update to MATCHED and order status to AWAITING_PAYMENT
    // are now handled automatically by database triggers

    // Update order with pricing details (status update handled by trigger)
    await supabase
      .from("placed_orders")
      .update({
        total_amount: totalAmount,
        farmer_share_amount:    breakdown.basePrice,
        transporter_fee_amount: breakdown.deliveryFee,
        platform_fee_amount:    breakdown.serviceCharge,
        blockchain_status: blockchainStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", proposal.order_id);

    // 6. Save to order_assignments for record (soft-fail if table unavailable)
    try {
      await supabase.from("order_assignments").insert([
        {
          order_id: proposal.order_id,
          stock_id: proposal.stock_id,
          farmer_id: farmerId,
          quantity_allocated: proposal.quantity_proposed,
          match_score: 1.0,
        },
      ]);
    } catch (_assignErr) {}

    // Note: Cancellation of competing proposals and stock release is handled by database triggers

    // Notify buyer that farmer accepted and payment is now required
    try {
      const { data: ord } = await supabase
        .from("placed_orders")
        .select("buyer_id")
        .eq("id", proposal.order_id)
        .single();
      if (ord && ord.buyer_id) {
        await sendSystemNotification(ord.buyer_id, {
          message: `Farmer accepted your proposal for order ${proposal.order_id}. Please complete payment.`,
          severity: "info",
        });
      }
    } catch (notifErr) {
      console.warn("Failed to notify buyer about acceptance:", notifErr.message);
    }

    return res.status(200).json({
      message:
        "Proposal accepted! Buyer must now upload bank payment slip to confirm order.",
      requiresPayment: true,
      totalAmount: totalAmount,
      blockchainStatus: blockchainStatus,
      paymentInstructions:
        "Please upload bank payment slip to /api/buyer/payment-slip/upload",
    });
  } catch (err) {
    console.error("AcceptProposal Error:", err);
    return res
      .status(500)
      .json({ message: "Server error", error: err.message });
  }
};

// POST: Farmer rejects a proposal
const rejectProposal = async (req, res) => {
  try {
    const userId = req.user.id;
    const { proposalId } = req.params;

    const farmerId = await getFarmerId(userId);

    // 1. Get proposal and verify ownership
    const { data: proposal, error: proposalError } = await supabase
      .from("match_proposals")
      .select("id, order_id, stock:estimated_stock!stock_id(farmer_id)")
      .eq("id", proposalId)
      .eq("status", "PENDING_FARMER")
      .single();

    if (proposalError || !proposal) {
      return res
        .status(404)
        .json({ message: "Proposal not found or already processed" });
    }

    // Verify the stock belongs to this farmer
    if (proposal.stock.farmer_id !== farmerId) {
      return res
        .status(403)
        .json({ message: "You don't have permission to reject this proposal" });
    }

    // 2. Update proposal status (triggers will handle order/stock status updates)
    await supabase
      .from("match_proposals")
      .update({
        status: "REJECTED",
        farmer_response_at: new Date().toISOString(),
      })
      .eq("id", proposalId);

    // Note: Order status reset to OPEN and stock release are handled by database triggers

    // Notify buyer that farmer rejected the proposal
    try {
      const { data: ord } = await supabase
        .from("placed_orders")
        .select("buyer_id")
        .eq("id", proposal.order_id)
        .single();
      if (ord && ord.buyer_id) {
        await sendSystemNotification(ord.buyer_id, {
          message: `Farmer rejected your proposal for order ${proposal.order_id}. Please choose another farmer.`,
          severity: "info",
        });
      }
    } catch (notifErr) {
      console.warn("Failed to notify buyer about rejection:", notifErr.message);
    }

    return res.status(200).json({
      message: "Proposal rejected. Buyer can select another farmer.",
    });
  } catch (err) {
    console.error("RejectProposal Error:", err);
    return res
      .status(500)
      .json({ message: "Server error", error: err.message });
  }
};

module.exports = { getProposals, acceptProposal, rejectProposal };
