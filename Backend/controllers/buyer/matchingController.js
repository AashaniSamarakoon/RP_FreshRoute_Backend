const { supabase } = require("../../utils/supabaseClient");
const { runMatchingAlgorithm } = require("../../Services/matchingService");

// Helper: Get buyer ID from user ID
const getBuyerId = async (userId) => {
  const { data: buyerData, error: buyerError } = await supabase
    .from("buyers")
    .select("id")
    .eq("user_id", userId)
    .single();

  if (buyerError || !buyerData) {
    throw new Error("No buyer profile found.");
  }
  return buyerData.id;
};

// Get all proposals for a buyer's order
const getProposalsForOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.user?.id;

    if (!orderId) {
      return res.status(400).json({ error: "Order ID is required" });
    }

    // Get actual buyer_id from buyers table
    const buyerId = await getBuyerId(userId);

    // Verify buyer owns this order
    const { data: order, error: orderError } = await supabase
      .from("placed_orders")
      .select(
        "id, buyer_id, fruit_type, variant, quantity, required_date, status"
      )
      .eq("id", orderId)
      .eq("buyer_id", buyerId)
      .single();

    if (orderError || !order) {
      return res.status(404).json({ error: "Order not found" });
    }

    // Get all proposals for this order with farmer details
    const { data: proposals, error: proposalError } = await supabase
      .from("match_proposals")
      .select(
        `
        id,
        stock_id,
        quantity_proposed,
        status,
        match_score,
        expires_at,
        created_at,
        stock:stock_id (
          id,
          quantity,
          price_per_kg,
          estimated_harvest_date,
          image_url,
          image_hash,
          farmer:farmer_id (
            id,
            reputation,
            latitude,
            longitude,
            location,
            user:user_id (
              id,
              name,
              email,
              phone
            )
          )
        )
      `
      )
      .eq("order_id", orderId)
      .order("match_score", { ascending: false }); // Highest scores first

    if (proposalError) {
      return res.status(500).json({ error: proposalError.message });
    }

    return res.status(200).json({
      order,
      proposals: proposals || [],
      totalProposals: proposals ? proposals.length : 0,
    });
  } catch (err) {
    console.error("[Matching] Error getting proposals:", err);
    return res.status(500).json({ error: err.message });
  }
};

// Get all active proposals for buyer
const getAllProposals = async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Get actual buyer_id from buyers table
    const buyerId = await getBuyerId(userId);

    // Get all orders for this buyer that have active proposals
    const { data: orders, error: ordersError } = await supabase
      .from("placed_orders")
      .select("id")
      .eq("buyer_id", buyerId)
      .eq("status", "PENDING_BUYER"); // Orders with proposals waiting for buyer approval

    if (ordersError) {
      return res.status(500).json({ error: ordersError.message });
    }

    if (!orders || orders.length === 0) {
      return res.status(200).json({ proposals: [] });
    }

    const orderIds = orders.map((o) => o.id);

    // Get all proposals for buyer's orders
    const { data: proposals, error: proposalError } = await supabase
      .from("match_proposals")
      .select(
        `
        id,
        order_id,
        stock_id,
        quantity_proposed,
        status,
        match_score,
        expires_at,
        created_at,
        stock:stock_id (
          id,
          farmer:farmer_id (
            user:user_id (
              name,
              phone
            )
          )
        ),
        order:order_id (
          fruit_type,
          variant,
          quantity
        )
      `
      )
      .in("order_id", orderIds)
      .in("status", ["PENDING_BUYER", "PENDING_FARMER", "ACCEPTED"])
      .order("created_at", { ascending: false });

    if (proposalError) {
      return res.status(500).json({ error: proposalError.message });
    }

    return res.status(200).json({
      proposals: proposals || [],
      totalProposals: proposals ? proposals.length : 0,
    });
  } catch (err) {
    console.error("[Matching] Error getting all proposals:", err);
    return res.status(500).json({ error: err.message });
  }
};

// Run matching for a new order
const triggerMatching = async (req, res) => {
  try {
    // Accept orderId from body, query, or params
    const orderId =
      req.body?.orderId || req.query?.orderId || req.params?.orderId;
    const userId = req.user?.id;

    if (!orderId) {
      return res.status(400).json({ error: "Order ID is required" });
    }

    // Get actual buyer_id from buyers table
    const buyerId = await getBuyerId(userId);

    // Verify buyer owns this order
    const { data: order, error: orderError } = await supabase
      .from("placed_orders")
      .select("id, status")
      .eq("id", orderId)
      .eq("buyer_id", buyerId)
      .single();

    if (orderError || !order) {
      return res.status(404).json({ error: "Order not found" });
    }

    if (order.status !== "OPEN") {
      return res.status(400).json({
        error: `Cannot match order with status: ${order.status}`,
      });
    }

    // Run matching algorithm
    const proposals = await runMatchingAlgorithm(orderId);

    if (proposals.length === 0) {
      return res.status(200).json({
        message: "No matching farmers found",
        proposals: [],
      });
    }

    // Update order status
    await supabase
      .from("placed_orders")
      .update({
        status: "PENDING_BUYER", // Proposals created, waiting for buyer approval
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId);

    return res.status(200).json({
      message: `Found ${proposals.length} matching farmers`,
      proposals,
      totalProposals: proposals.length,
    });
  } catch (err) {
    console.error("[Matching] Error triggering matching:", err);
    return res.status(500).json({ error: err.message });
  }
};

// Buyer approves a proposal (changes status to PENDING_FARMER)
const approveProposal = async (req, res) => {
  try {
    const { proposalId } = req.params;
    const userId = req.user?.id;

    if (!proposalId) {
      return res.status(400).json({ error: "Proposal ID is required" });
    }

    // Get actual buyer_id from buyers table
    const buyerId = await getBuyerId(userId);

    // Get proposal and verify ownership through order
    const { data: proposal, error: proposalError } = await supabase
      .from("match_proposals")
      .select("*, order:order_id(buyer_id)")
      .eq("id", proposalId)
      .eq("status", "PENDING_BUYER")
      .single();

    if (proposalError || !proposal) {
      return res
        .status(404)
        .json({ error: "Proposal not found or not pending buyer approval" });
    }

    // Verify buyer owns this order
    if (proposal.order.buyer_id !== buyerId) {
      return res
        .status(403)
        .json({ error: "You don't have permission to approve this proposal" });
    }

    // Update proposal status to PENDING_FARMER
    const { error: updateError } = await supabase
      .from("match_proposals")
      .update({
        status: "PENDING_FARMER",
        updated_at: new Date().toISOString(),
      })
      .eq("id", proposalId);

    if (updateError) {
      return res.status(500).json({ error: updateError.message });
    }

    // Update order status to PENDING_FARMER
    await supabase
      .from("placed_orders")
      .update({
        status: "PENDING_FARMER",
        updated_at: new Date().toISOString(),
      })
      .eq("id", proposal.order_id);

    return res.status(200).json({
      message: "Proposal approved! Now waiting for farmer response.",
      proposalId,
    });
  } catch (err) {
    console.error("[Matching] Error approving proposal:", err);
    return res.status(500).json({ error: err.message });
  }
};

module.exports = {
  getProposalsForOrder,
  getAllProposals,
  triggerMatching,
  approveProposal,
};
