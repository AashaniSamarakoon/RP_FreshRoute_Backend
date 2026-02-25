const { supabase } = require("../../utils/supabaseClient");
const { getContract } = require("../../Services/blockchain/contractService");

// Helper: Get farmer ID from user ID
// farmer table only stores user_id; this returns the UUID directly.
const getFarmerId = async (userId) => {
  const { data: farmerData, error: farmerError } = await supabase
    .from("farmer")
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
        order:order_id (
          fruit_type,
          variant,
          grade,
          quantity,
          required_date,
          delivery_location,
          buyer:buyer_id (
            id,
            user:user_id (
              name,
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

    return res.status(200).json({
      message: `Found ${proposals.length} pending proposals`,
      proposals: proposals,
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
      .select("*, order:order_id(*), stock:stock_id(farmer_id)")
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

    // 3. Record on Blockchain
    const blockchainOrderId = `ORDER_${proposal.order_id}`;
    const harvestId = `HARVEST_${proposal.stock_id}`;
    let blockchainStatus = "Pending";

    try {
      console.log(
        `[Blockchain] Locking stock for Order ${blockchainOrderId}...`,
      );

      const { contract, close } = await getContract(userId, "OrderContract");

      try {
        await contract.submitTransaction(
          "CreateOrder",
          blockchainOrderId,
          harvestId,
          proposal.quantity_proposed.toString(),
        );
        blockchainStatus = "Confirmed";
        console.log("[Blockchain] Stock locked successfully.");
      } finally {
        await close();
      }
    } catch (bcError) {
      console.error("[Blockchain] Lock failed:", bcError.message);
      blockchainStatus = "Failed: " + bcError.message;
      // Continue anyway - we can retry blockchain later
    }

    // 4. Update proposal status
    await supabase
      .from("match_proposals")
      .update({
        status: "ACCEPTED",
        farmer_response_at: new Date().toISOString(),
      })
      .eq("id", proposalId);

    // 5. Deduct stock quantity
    await supabase
      .from("estimated_stock")
      .update({ quantity: stock.quantity - proposal.quantity_proposed })
      .eq("id", proposal.stock_id);

    // Calculate total amount using buyer pricing logic
    // first fetch the order to get location and other fields
    const { data: orderRow } = await supabase
      .from("placed_orders")
      .select("*")
      .eq("id", proposal.order_id)
      .single();
    let distance = 0;
    if (orderRow) {
      // compute distance between farmer and delivery point
      const { data: farmerInfo } = await supabase
        .from("farmer")
        .select("latitude, longitude")
        .eq("id", farmerId)
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

    // 6. Update order status to AWAITING_PAYMENT
    await supabase
      .from("placed_orders")
      .update({
        status: "AWAITING_PAYMENT",
        selected_farmer_id: farmerId,
        harvest_id: proposal.stock_id,
        total_amount: totalAmount,
        blockchain_status: blockchainStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", proposal.order_id);

    // 7. Save to order_assignments for record
    await supabase.from("order_assignments").insert([
      {
        order_id: proposal.order_id,
        stock_id: proposal.stock_id,
        farmer_id: farmerId,
        quantity_allocated: proposal.quantity_proposed,
        match_score: 1.0, // Direct acceptance
      },
    ]);

    // TODO: Notify buyer to complete payment

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
      .select("id, order_id, stock:stock_id(farmer_id)")
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

    // 2. Update proposal status
    await supabase
      .from("match_proposals")
      .update({
        status: "REJECTED",
        farmer_response_at: new Date().toISOString(),
      })
      .eq("id", proposalId);

    // 3. Reset order status so buyer can select another farmer
    await supabase
      .from("placed_orders")
      .update({
        status: "OPEN",
        updated_at: new Date().toISOString(),
      })
      .eq("id", proposal.order_id);

    // TODO: Notify buyer that farmer rejected

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
