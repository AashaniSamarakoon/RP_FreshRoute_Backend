const { supabase } = require("../../utils/supabaseClient");
const { runMatchingAlgorithm } = require("../../Services/matchingService");

// Helper: Get buyer ID from user ID
// Since the buyers table uses `user_id` as the key, simply verify the row
// exists and return the UUID itself.
const getBuyerId = async (userId) => {
  const { data: buyerData, error: buyerError } = await supabase
    .from("buyers")
    .select("user_id")
    .eq("user_id", userId)
    .single();

  if (buyerError || !buyerData) {
    const msg = `No buyer profile found for user_id=${userId}`;
    console.error(msg, buyerError);
    throw new Error(msg);
  }
  return buyerData.user_id;
};

// Helper: Get farmer ID from user ID
// The farmer table uses user_id as its primary key, so simply verify
// existence and return it.
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

// Helper: Resolve buyer ID (accepts either user_id or buyer_id)
// When the table only has user_id, the two are identical; just verify
// existence and return the value.
const resolveBuyerId = async (id) => {
  const { data: buyerData, error } = await supabase
    .from("buyers")
    .select("user_id")
    .eq("user_id", id)
    .single();

  if (error || !buyerData) {
    throw new Error(`No buyer found with the provided ID (${id})`);
  }
  return buyerData.user_id;
};

// Helper: Resolve farmer ID (accepts either user_id or farmer_id)
// Since the farmers table only stores user_id, treat both cases the same.
const resolveFarmerId = async (id) => {
  const { data: farmerData, error } = await supabase
    .from("farmers")
    .select("user_id")
    .eq("user_id", id)
    .single();

  if (error || !farmerData) {
    throw new Error(`No farmer found with the provided ID (${id})`);
  }
  return farmerData.user_id;
};

// Get all proposals for a buyer's order
const getProposalsForOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.user?.id;

    if (!orderId) {
      return res.status(400).json({ error: "Order ID is required" });
    }

    // Get actual buyer_id from buyers table (throws if missing)
    const buyerId = await getBuyerId(userId);

    // Verify buyer owns this order
    const { data: order, error: orderError } = await supabase
      .from("placed_orders")
      .select(
        "id, buyer_id, fruit_type, variant, quantity, required_date, status",
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
            user_id,
            reputation,
            latitude,
            longitude,
            location
          )
        )
      `,
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
            /* user details omitted to avoid schema cache ambiguity */
          )
        ),
        order:order_id (
          fruit_type,
          variant,
          quantity
        )
      `,
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

// Get proposals by buyer ID (admin or cross-reference use)
const getProposalsByBuyerId = async (req, res) => {
  try {
    const { buyerId: inputId } = req.params;

    if (!inputId) {
      return res.status(400).json({ error: "Buyer ID or User ID is required" });
    }

    // Resolve to actual buyer_id (accepts either user_id or buyer_id)
    const buyerId = await resolveBuyerId(inputId);

    // Get all orders for this buyer
    const { data: orders, error: ordersError } = await supabase
      .from("placed_orders")
      .select("id, fruit_type, variant, quantity, required_date, status")
      .eq("buyer_id", buyerId);

    if (ordersError) {
      return res.status(500).json({ error: ordersError.message });
    }

    if (!orders || orders.length === 0) {
      return res.status(200).json({
        buyerId,
        orders: [],
        proposals: [],
        totalProposals: 0,
      });
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
          quantity,
          price_per_kg,
          estimated_harvest_date,
          farmer:farmer_id (
            user_id,
            reputation,
            location
          )
        ),
        order:order_id (
          id,
          fruit_type,
          variant,
          quantity,
          required_date
        )
      `,
      )
      .in("order_id", orderIds)
      .order("created_at", { ascending: false });

    if (proposalError) {
      return res.status(500).json({ error: proposalError.message });
    }

    return res.status(200).json({
      buyerId,
      orders,
      proposals: proposals || [],
      totalProposals: proposals ? proposals.length : 0,
    });
  } catch (err) {
    console.error("[Matching] Error getting proposals by buyer ID:", err);
    return res.status(500).json({ error: err.message });
  }
};

// Get proposals by farmer ID (admin or cross-reference use)
const getProposalsByFarmerId = async (req, res) => {
  try {
    const { farmerId: inputId } = req.params;

    if (!inputId) {
      return res
        .status(400)
        .json({ error: "Farmer ID or User ID is required" });
    }

    // Resolve to actual farmer_id (accepts either user_id or farmer_id)
    const farmerId = await resolveFarmerId(inputId);

    // Get all stocks for this farmer
    const { data: stocks, error: stockError } = await supabase
      .from("estimated_stock")
      .select(
        "id, quantity, price_per_kg, estimated_harvest_date, fruit_type, variant",
      )
      .eq("farmer_id", farmerId);

    if (stockError) {
      return res.status(500).json({ error: stockError.message });
    }

    if (!stocks || stocks.length === 0) {
      return res.status(200).json({
        farmerId,
        stocks: [],
        proposals: [],
        totalProposals: 0,
      });
    }

    const stockIds = stocks.map((s) => s.id);

    // Get all proposals for farmer's stocks
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
        order:order_id (
          id,
          fruit_type,
          variant,
          quantity,
          required_date,
          delivery_location,
          buyer:buyer_id (
            id,
            user:user_id (
              id,
              name,
              email,
              phone
            )
          )
        ),
        stock:stock_id (
          id,
          quantity,
          price_per_kg,
          estimated_harvest_date
        )
      `,
      )
      .in("stock_id", stockIds)
      .order("created_at", { ascending: false });

    if (proposalError) {
      return res.status(500).json({ error: proposalError.message });
    }

    return res.status(200).json({
      farmerId,
      stocks,
      proposals: proposals || [],
      totalProposals: proposals ? proposals.length : 0,
    });
  } catch (err) {
    console.error("[Matching] Error getting proposals by farmer ID:", err);
    return res.status(500).json({ error: err.message });
  }
};

module.exports = {
  getProposalsForOrder,
  getAllProposals,
  getProposalsByBuyerId,
  getProposalsByFarmerId,
  triggerMatching,
  approveProposal,
};
