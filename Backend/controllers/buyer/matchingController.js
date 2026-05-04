const { supabaseAdmin: supabase } = require("../../utils/supabaseClient");
const { runMatchingAlgorithm, releaseStockReservation } = require("../../Services/matchingService");
const { fetchUnitPrice, calculatePrice } = require("../../utils/pricingUtils");

// ─── Shared Supabase select fragments ────────────────────────────────────────

const FARMER_SELECT = `
  user_id,
  reputation,
  latitude,
  longitude,
  location,
  user:users!user_id (
    id,
    first_name,
    last_name,
    email,
    phone
  )
`;

const ORDER_SELECT = `
  id,
  buyer_id,
  fruit_type,
  variant,
  quantity,
  grade,
  required_date,
  delivery_location,
  latitude,
  longitude,
  status,
  payment_status,
  total_amount,
  selected_farmer_id,
  harvest_id,
  blockchain_status,
  blockchain_tx_id,
  created_at,
  updated_at
`;

const STOCK_SELECT = `
  id,
  quantity,
  price_per_kg,
  estimated_harvest_date,
  image_url,
  image_hash,
  fruit_type,
  variant,
  farmer:farmers!farmer_id (${FARMER_SELECT})
`;

const PROPOSAL_WITH_STOCK_AND_ORDER = `
  id,
  order_id,
  stock_id,
  quantity_proposed,
  status,
  match_score,
  distance_km,
  expires_at,
  created_at,
  stock:estimated_stock!stock_id (${STOCK_SELECT}),
  order:placed_orders!order_id (${ORDER_SELECT})
`;

// ─── Per-proposal price enrichment ───────────────────────────────────────────
// Resolves unit price (farmer's or market fallback) then reuses calculatePrice.
async function attachPricing(proposals) {
  const today = new Date().toISOString().split("T")[0];
  return Promise.all(
    (proposals || []).map(async (p) => {
      let unitPrice = p.stock?.price_per_kg > 0 ? p.stock.price_per_kg : null;
      let priceSource = unitPrice != null ? "farmer" : null;

      if (unitPrice == null) {
        const fruit   = p.stock?.fruit_type ?? p.order?.fruit_type;
        const variant = p.stock?.variant    ?? p.order?.variant;
        const grade   = p.order?.grade;
        if (fruit && variant && grade) {
          unitPrice   = await fetchUnitPrice(fruit, variant, grade, today);
          priceSource = unitPrice != null ? "market" : null;
        }
      }

      const breakdown = calculatePrice(
        { quantity: p.quantity_proposed ?? 0, distance_km: p.distance_km ?? 0 },
        unitPrice,
      );

      return {
        ...p,
        pricing: { ...breakdown, estimatedTotal: breakdown.totalPrice, priceSource },
      };
    }),
  );
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

/** Verify a buyer exists and return their user_id. */
const getBuyerId = async (userId) => {
  const { data, error } = await supabase
    .from("buyers")
    .select("user_id")
    .eq("user_id", userId)
    .single();

  if (error || !data)
    throw new Error(`No buyer profile found for user_id=${userId}`);
  return data.user_id;
};

/** Verify a farmer exists and return their user_id. */
const getFarmerId = async (userId) => {
  const { data, error } = await supabase
    .from("farmers")
    .select("user_id")
    .eq("user_id", userId)
    .single();

  if (error || !data)
    throw new Error(`No farmer profile found for user_id=${userId}`);
  return data.user_id;
};

// ─── Controllers ─────────────────────────────────────────────────────────────

/** GET /api/buyer/matching/:orderId – all proposals for one specific order */
const getProposalsForOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    if (!orderId)
      return res.status(400).json({ error: "Order ID is required" });

    const buyerId = await getBuyerId(req.user?.id);

    const { data: order, error: orderError } = await supabase
      .from("placed_orders")
      .select(ORDER_SELECT)
      .eq("id", orderId)
      .eq("buyer_id", buyerId)
      .single();

    if (orderError || !order)
      return res.status(404).json({ error: "Order not found" });

    const { data: proposals, error: proposalError } = await supabase
      .from("match_proposals")
      .select(PROPOSAL_WITH_STOCK_AND_ORDER)
      .eq("order_id", orderId)
      .order("match_score", { ascending: false });

    if (proposalError)
      return res.status(500).json({ error: proposalError.message });

    const enriched = await attachPricing(proposals);
    return res
      .status(200)
      .json({
        order,
        proposals: enriched,
        totalProposals: enriched.length,
      });
  } catch (err) {
    console.error("[Matching] getProposalsForOrder:", err);
    return res.status(500).json({ error: err.message });
  }
};

/** GET /api/buyer/matching – all active proposals across all of the buyer's orders */
const getAllProposals = async (req, res) => {
  try {
    const buyerId = await getBuyerId(req.user?.id);

    const { data: orders, error: ordersError } = await supabase
      .from("placed_orders")
      .select("id")
      .eq("buyer_id", buyerId)
      .in("status", ["PENDING_BUYER", "PENDING_FARMER"]);

    if (ordersError)
      return res.status(500).json({ error: ordersError.message });
    if (!orders?.length)
      return res.status(200).json({ proposals: [], totalProposals: 0 });

    const { data: proposals, error: proposalError } = await supabase
      .from("match_proposals")
      .select(PROPOSAL_WITH_STOCK_AND_ORDER)
      .in(
        "order_id",
        orders.map((o) => o.id),
      )
      .in("status", ["PENDING_BUYER", "PENDING_FARMER"])
      .order("created_at", { ascending: false });

    if (proposalError)
      return res.status(500).json({ error: proposalError.message });

    const enriched = await attachPricing(proposals);
    return res
      .status(200)
      .json({
        proposals: enriched,
        totalProposals: enriched.length,
      });
  } catch (err) {
    console.error("[Matching] getAllProposals:", err);
    return res.status(500).json({ error: err.message });
  }
};

/** GET /api/buyer/matching/user/:userId – all proposals for a specific buyer */
const getProposalsByBuyerId = async (req, res) => {
  try {
    const inputId = req.params.buyerId || req.params.userId;
    if (!inputId)
      return res.status(400).json({ error: "Buyer ID or User ID is required" });

    const buyerId = await getBuyerId(inputId);

    const { data: orders, error: ordersError } = await supabase
      .from("placed_orders")
      .select(ORDER_SELECT)
      .eq("buyer_id", buyerId);

    if (ordersError)
      return res.status(500).json({ error: ordersError.message });
    if (!orders?.length) {
      return res
        .status(200)
        .json({ buyerId, orders: [], proposals: [], totalProposals: 0 });
    }

    const { data: proposals, error: proposalError } = await supabase
      .from("match_proposals")
      .select(PROPOSAL_WITH_STOCK_AND_ORDER)
      .in(
        "order_id",
        orders.map((o) => o.id),
      )
      .order("created_at", { ascending: false });

    if (proposalError)
      return res.status(500).json({ error: proposalError.message });

    const enriched = await attachPricing(proposals);
    return res
      .status(200)
      .json({
        buyerId,
        orders,
        proposals: enriched,
        totalProposals: enriched.length,
      });
  } catch (err) {
    console.error("[Matching] getProposalsByBuyerId:", err);
    return res.status(500).json({ error: err.message });
  }
};

/** GET /api/buyer/matching/farmer/:farmerId – all proposals for a specific farmer */
const getProposalsByFarmerId = async (req, res) => {
  try {
    const { farmerId: inputId } = req.params;
    if (!inputId)
      return res
        .status(400)
        .json({ error: "Farmer ID or User ID is required" });

    const farmerId = await getFarmerId(inputId);

    const { data: stocks, error: stockError } = await supabase
      .from("estimated_stock")
      .select(
        "id, quantity, price_per_kg, estimated_harvest_date, fruit_type, variant",
      )
      .eq("farmer_id", farmerId);

    if (stockError) return res.status(500).json({ error: stockError.message });
    if (!stocks?.length) {
      return res
        .status(200)
        .json({ farmerId, stocks: [], proposals: [], totalProposals: 0 });
    }

    const FARMER_PROPOSAL_SELECT = `
      id,
      order_id,
      stock_id,
      quantity_proposed,
      status,
      match_score,
      distance_km,
      expires_at,
      created_at,
      order:placed_orders!order_id (
        ${ORDER_SELECT},
        buyer:buyers!buyer_id (
          user_id,
          user:users!user_id (
            id,
            first_name,
            last_name,
            email,
            phone
          )
        )
      ),
      stock:estimated_stock!stock_id (
        id,
        quantity,
        price_per_kg,
        estimated_harvest_date,
        image_url,
        image_hash,
        fruit_type,
        variant
      )
    `;

    const { data: proposals, error: proposalError } = await supabase
      .from("match_proposals")
      .select(FARMER_PROPOSAL_SELECT)
      .in(
        "stock_id",
        stocks.map((s) => s.id),
      )
      .order("created_at", { ascending: false });

    if (proposalError)
      return res.status(500).json({ error: proposalError.message });

    const enriched = await attachPricing(proposals);
    return res
      .status(200)
      .json({
        farmerId,
        stocks,
        proposals: enriched,
        totalProposals: enriched.length,
      });
  } catch (err) {
    console.error("[Matching] getProposalsByFarmerId:", err);
    return res.status(500).json({ error: err.message });
  }
};

/** POST /api/buyer/matching/trigger/:orderId – run matching algorithm for an order */
const triggerMatching = async (req, res) => {
  try {
    const orderId =
      req.body?.orderId || req.query?.orderId || req.params?.orderId;
    if (!orderId)
      return res.status(400).json({ error: "Order ID is required" });

    const buyerId = await getBuyerId(req.user?.id);

    const { data: order, error: orderError } = await supabase
      .from("placed_orders")
      .select("id, status")
      .eq("id", orderId)
      .eq("buyer_id", buyerId)
      .single();

    if (orderError || !order)
      return res.status(404).json({ error: "Order not found" });
    if (order.status !== "OPEN") {
      return res
        .status(400)
        .json({ error: `Cannot match order with status: ${order.status}` });
    }

    const proposals = await runMatchingAlgorithm(orderId);
    if (!proposals.length) {
      return res
        .status(200)
        .json({ message: "No matching farmers found", proposals: [] });
    }

    await supabase
      .from("placed_orders")
      .update({ status: "PENDING_BUYER", updated_at: new Date().toISOString() })
      .eq("id", orderId);

    return res
      .status(200)
      .json({
        message: `Found ${proposals.length} matching farmers`,
        proposals,
        totalProposals: proposals.length,
      });
  } catch (err) {
    console.error("[Matching] triggerMatching:", err);
    return res.status(500).json({ error: err.message });
  }
};

/** POST /api/buyer/matching/approve/:proposalId – buyer approves a proposal */
const approveProposal = async (req, res) => {
  try {
    const { proposalId } = req.params;
    if (!proposalId)
      return res.status(400).json({ error: "Proposal ID is required" });

    const buyerId = await getBuyerId(req.user?.id);

    const { data: proposal, error: proposalError } = await supabase
      .from("match_proposals")
      .select("*, order:placed_orders!order_id(buyer_id)")
      .eq("id", proposalId)
      .eq("status", "PENDING_BUYER")
      .single();

    if (proposalError || !proposal) {
      return res
        .status(404)
        .json({ error: "Proposal not found or not pending buyer approval" });
    }
    if (proposal.order.buyer_id !== buyerId) {
      return res
        .status(403)
        .json({ error: "You don't have permission to approve this proposal" });
    }

    const { error: updateError } = await supabase
      .from("match_proposals")
      .update({
        status: "PENDING_FARMER",
        updated_at: new Date().toISOString(),
      })
      .eq("id", proposalId);

    if (updateError)
      return res.status(500).json({ error: updateError.message });

    await supabase
      .from("placed_orders")
      .update({
        status: "PENDING_FARMER",
        updated_at: new Date().toISOString(),
      })
      .eq("id", proposal.order_id);

    // Note: Cancellation of competing proposals happens when farmer accepts, handled by database triggers

    return res
      .status(200)
      .json({
        message: "Proposal approved! Now waiting for farmer response.",
        proposalId,
      });
  } catch (err) {
    console.error("[Matching] approveProposal:", err);
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
