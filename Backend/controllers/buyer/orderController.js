const { supabase } = require("../../utils/supabaseClient");
const { getContract } = require("../../Services/blockchain/contractService");
const { runMatchingAlgorithm } = require("../../Services/matchingService");

// STEP 1: Buyer Posts a Request (Supabase Only)
const placeOrder = async (req, res) => {
  try {
    const userId = req.user && req.user.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    // 1. Fetch Buyer
    const { data: buyerData, error: buyerError } = await supabase
      .from("buyers")
      .select("id")
      .eq("user_id", userId)
      .single();

    if (buyerError || !buyerData)
      return res.status(404).json({ message: "Buyer profile not found" });

    const {
      fruit_type,
      variant,
      quantity,
      grade,
      required_date,
      delivery_location,
      latitude,
      longitude,
      target_price,
    } = req.body;

    // 2. Validate
    if (!fruit_type || !variant || !required_date)
      return res.status(400).json({ message: "Missing fields" });
    if (!Number.isInteger(quantity) || quantity <= 0)
      return res.status(400).json({ message: "Invalid quantity" });

    // 3. Save "Request" to Supabase
    const { data: orderData, error: insertError } = await supabase
      .from("placed_orders")
      .insert([
        {
          buyer_id: buyerData.id,
          fruit_type,
          variant,
          quantity,
          grade,
          required_date,
          delivery_location,
          latitude,
          longitude,
          target_price: target_price || null, // Save if provided
          status: "OPEN", // Initial status
        },
      ])
      .select("*")
      .single();

    if (insertError) throw new Error(insertError.message);

    // 4. Run Matching Algorithm Immediately
    const matches = await runMatchingAlgorithm(orderData.id);

    // 5. Update status if matches found
    let finalStatus = "OPEN";
    if (matches && matches.length > 0) {
      finalStatus = "PENDING_ACCEPTANCE";
      await supabase
        .from("placed_orders")
        .update({ status: finalStatus, updated_at: new Date().toISOString() })
        .eq("id", orderData.id);
    }

    // RETURN matches immediately so Buyer can choose
    // If no matches now, cron job will retry every 2 hours
    return res.status(201).json({
      message:
        matches.length > 0
          ? "Order placed. Matches found! Please select a farmer."
          : "Order placed. No matches yet - we'll notify you when farmers are available.",
      order: { ...orderData, status: finalStatus },
      matches: matches,
    });
  } catch (err) {
    console.error("PlaceOrder Error:", err);
    return res
      .status(500)
      .json({ message: "Server error", error: err.message });
  }
};

// STEP 2: Buyer Selects a Farmer (saves to match_proposals, notifies farmer)
const selectFarmer = async (req, res) => {
  try {
    const userId = req.user.id;
    const { orderId, stockId, farmerId, quantityRequested } = req.body;

    // 1. Validate inputs
    if (!orderId || !stockId || !farmerId) {
      return res.status(400).json({
        message: "Missing required fields: orderId, stockId, farmerId",
      });
    }

    // 2. Get buyer ID
    const { data: buyerData, error: buyerError } = await supabase
      .from("buyers")
      .select("id")
      .eq("user_id", userId)
      .single();

    if (buyerError || !buyerData) {
      return res.status(404).json({ message: "Buyer profile not found" });
    }

    // 3. Verify order belongs to this buyer and is in correct status
    const { data: order, error: orderError } = await supabase
      .from("placed_orders")
      .select("*")
      .eq("id", orderId)
      .eq("buyer_id", buyerData.id)
      .single();

    if (orderError || !order) {
      return res
        .status(404)
        .json({ message: "Order not found or access denied" });
    }

    if (order.status !== "OPEN" && order.status !== "MATCHED") {
      return res.status(400).json({
        message: `Cannot select farmer for order with status: ${order.status}`,
      });
    }

    // 4. Verify stock exists and has enough quantity
    const { data: stock, error: stockError } = await supabase
      .from("estimated_stock")
      .select("id, quantity, farmer_id")
      .eq("id", stockId)
      .eq("farmer_id", farmerId)
      .single();

    if (stockError || !stock) {
      return res.status(404).json({ message: "Stock not found" });
    }

    const qty = quantityRequested || order.quantity;
    if (stock.quantity < qty) {
      return res
        .status(400)
        .json({ message: `Insufficient stock. Available: ${stock.quantity}` });
    }

    // 5. Create match proposal for farmer to review
    const { data: proposal, error: proposalError } = await supabase
      .from("match_proposals")
      .insert([
        {
          order_id: orderId,
          stock_id: stockId,
          farmer_id: farmerId,
          buyer_id: buyerData.id,
          quantity_proposed: qty,
          status: "PENDING_BUYER", // Initial status - buyer needs to approve
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours to respond
        },
      ])
      .select("*")
      .single();

    if (proposalError) {
      throw new Error("Failed to create proposal: " + proposalError.message);
    }

    // 6. Update order status
    await supabase
      .from("placed_orders")
      .update({
        status: "PENDING_BUYER", // Proposal created, waiting for buyer approval
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId);

    // TODO: Send notification to farmer (email, push, etc.)

    return res.status(200).json({
      message: "Farmer selected. Waiting for farmer confirmation.",
      proposal: proposal,
    });
  } catch (err) {
    console.error("SelectFarmer Error:", err);
    return res
      .status(500)
      .json({ message: "Server error", error: err.message });
  }
};

// STEP 3: Get Matches for an Existing Order (for buyer to view later)
const getOrderMatches = async (req, res) => {
  try {
    const userId = req.user.id;
    const { orderId } = req.params;

    // 1. Get buyer ID
    const { data: buyerData } = await supabase
      .from("buyers")
      .select("id")
      .eq("user_id", userId)
      .single();

    if (!buyerData) {
      return res.status(404).json({ message: "Buyer profile not found" });
    }

    // 2. Verify order belongs to buyer
    const { data: order } = await supabase
      .from("placed_orders")
      .select("*")
      .eq("id", orderId)
      .eq("buyer_id", buyerData.id)
      .single();

    if (!order) {
      return res
        .status(404)
        .json({ message: "Order not found or access denied" });
    }

    // 3. Run matching algorithm to get current matches
    const matches = await runMatchingAlgorithm(orderId);

    return res.status(200).json({
      order: order,
      matches: matches,
    });
  } catch (err) {
    console.error("GetOrderMatches Error:", err);
    return res
      .status(500)
      .json({ message: "Server error", error: err.message });
  }
};

// STEP 4: Farmer Confirms (called from farmer controller, but can be here for now)
const confirmMatch = async (req, res) => {
  try {
    const userId = req.user.id;
    const { orderId, selectedHarvestId, selectedFarmerId } = req.body;

    // 1. Get Order details from Supabase
    const { data: order } = await supabase
      .from("placed_orders")
      .select("*")
      .eq("id", orderId)
      .single();
    if (!order) return res.status(404).json({ message: "Order not found" });

    // 2. CONNECT TO BLOCKCHAIN (Lock the Stock)
    const blockchainOrderId = `ORDER_${orderId}`;
    let blockchainStatus = "Pending";

    const { contract, close } = await getContract(userId, "OrderContract");

    try {
      console.log(`Locking stock for Order ${blockchainOrderId} on Ledger...`);

      // Call CreateOrder(ctx, orderId, harvestId, quantity, agreedPrice)
      await contract.submitTransaction(
        "CreateOrder",
        blockchainOrderId,
        selectedHarvestId, // Now we know the specific batch!
        order.quantity.toString()
      );

      blockchainStatus = "Confirmed";
      console.log("Stock locked on Blockchain.");
    } catch (bcError) {
      return res.status(500).json({
        message: "Blockchain Lock Failed. Stock might be gone.",
        error: bcError.message,
      });
    } finally {
      await close();
    }

    // 3. Update Supabase Status
    await supabase
      .from("placed_orders")
      .update({
        status: "ACCEPTED",
        selected_farmer_id: selectedFarmerId,
        harvest_id: selectedHarvestId,
        blockchain_status: blockchainStatus,
      })
      .eq("id", orderId);

    return res
      .status(200)
      .json({ success: true, message: "Order confirmed and stock locked." });
  } catch (err) {
    console.error("ConfirmMatch Error:", err);
    return res.status(500).json({ error: err.message });
  }
};

// GET: Get all orders for buyer
const getMyOrders = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    // Get buyer ID
    const { data: buyerData, error: buyerError } = await supabase
      .from("buyers")
      .select("id")
      .eq("user_id", userId)
      .single();

    if (buyerError || !buyerData) {
      return res.status(404).json({ message: "Buyer profile not found" });
    }

    // Get all orders for this buyer
    const { data: orders, error: ordersError } = await supabase
      .from("placed_orders")
      .select("*")
      .eq("buyer_id", buyerData.id)
      .order("created_at", { ascending: false });

    if (ordersError) throw new Error(ordersError.message);

    return res.status(200).json({
      orders: orders || [],
      totalOrders: orders ? orders.length : 0,
    });
  } catch (err) {
    console.error("GetMyOrders Error:", err);
    return res
      .status(500)
      .json({ message: "Server error", error: err.message });
  }
};

// GET: Get single order by ID
const getOrderById = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { orderId } = req.params;

    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    // Get buyer ID
    const { data: buyerData, error: buyerError } = await supabase
      .from("buyers")
      .select("id")
      .eq("user_id", userId)
      .single();

    if (buyerError || !buyerData) {
      return res.status(404).json({ message: "Buyer profile not found" });
    }

    // Get order
    const { data: order, error: orderError } = await supabase
      .from("placed_orders")
      .select("*")
      .eq("id", orderId)
      .eq("buyer_id", buyerData.id)
      .single();

    if (orderError || !order) {
      return res.status(404).json({ message: "Order not found" });
    }

    return res.status(200).json({ order });
  } catch (err) {
    console.error("GetOrderById Error:", err);
    return res
      .status(500)
      .json({ message: "Server error", error: err.message });
  }
};

module.exports = {
  placeOrder,
  selectFarmer,
  getOrderMatches,
  confirmMatch,
  getMyOrders,
  getOrderById,
};
