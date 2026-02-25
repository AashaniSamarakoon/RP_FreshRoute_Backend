const { supabase } = require("../../utils/supabaseClient");
const { getContract } = require("../../Services/blockchain/contractService");
const { runMatchingAlgorithm } = require("../../Services/matchingService");
const { calculateDistanceKm } = require("../../utils/logisticsUtils");

// utilities
async function fetchUnitPrice(fruit, variant, grade, date) {
  const { data, error } = await supabase
    .from("freshroute_prices")
    .select("price")
    .eq("fruit_name", fruit)
    .eq("variety", variant)
    .eq("grade", grade)
    .eq("target_date", date)
    .limit(1)
    .single();
  if (error && error.code !== "PGRST116") throw error;
  return data ? data.price : null;
}

function calculatePrice(order, unitPrice) {
  const basePrice = unitPrice != null ? unitPrice * order.quantity : null;
  const serviceCharge = basePrice != null ? basePrice * 0.01 : null;
  const distanceKm = order.distance_km || 0;
  const deliveryFee = distanceKm * 35;
  const totalPrice =
    basePrice != null ? basePrice + (serviceCharge || 0) + deliveryFee : null;
  return { unitPrice, basePrice, serviceCharge, deliveryFee, totalPrice };
}

async function ensureDistance(order) {
  if (
    (!order.distance_km || order.distance_km === 0) &&
    order.selected_farmer_id
  ) {
    const { data: farmerInfo } = await supabase
      .from("farmer")
      .select("latitude, longitude")
      .eq("id", order.selected_farmer_id)
      .single();
    if (
      farmerInfo &&
      order.latitude != null &&
      order.longitude != null &&
      farmerInfo.latitude != null &&
      farmerInfo.longitude != null
    ) {
      const d = calculateDistanceKm(
        order.latitude,
        order.longitude,
        farmerInfo.latitude,
        farmerInfo.longitude,
      );
      order.distance_km = d;
      await supabase
        .from("placed_orders")
        .update({ distance_km: d })
        .eq("id", order.id);
    }
  }
}

// STEP 1: Buyer Posts a Request (Supabase Only)
const placeOrder = async (req, res) => {
  try {
    const userId = req.user && req.user.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    // 1. Fetch Buyer
    const { data: buyerData, error: buyerError } = await supabase
      .from("buyers")
      .select("user_id")
      .eq("user_id", userId)
      .single();

    if (buyerError || !buyerData)
      return res.status(404).json({ message: "Buyer profile not found" });

    const buyerId = buyerData.user_id;

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
          buyer_id: buyerId,
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

    // 2. Get buyer ID (uuid stored as user_id)
    const { data: buyerData, error: buyerError } = await supabase
      .from("buyers")
      .select("user_id")
      .eq("user_id", userId)
      .single();

    if (buyerError || !buyerData) {
      return res.status(404).json({ message: "Buyer profile not found" });
    }
    const buyerId = buyerData.user_id;

    // 3. Verify order belongs to this buyer and is in correct status
    const { data: order, error: orderError } = await supabase
      .from("placed_orders")
      .select("*")
      .eq("id", orderId)
      .eq("buyer_id", buyerId)
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
          buyer_id: buyerId,
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

    // compute distance between farmer and delivery point if possible
    try {
      const { data: farmerInfo } = await supabase
        .from("farmer")
        .select("latitude, longitude")
        .eq("id", farmerId)
        .single();
      if (farmerInfo && order.latitude && order.longitude) {
        const dist = calculateDistanceKm(
          order.latitude,
          order.longitude,
          farmerInfo.latitude,
          farmerInfo.longitude,
        );
        await supabase
          .from("placed_orders")
          .update({ distance_km: dist })
          .eq("id", orderId);
        // also update total_amount using current pricing
        const unit = await fetchUnitPrice(
          order.fruit_type,
          order.variant,
          order.grade,
          new Date().toISOString().split("T")[0],
        );
        const breakdown = calculatePrice({ ...order, distance_km: dist }, unit);
        await supabase
          .from("placed_orders")
          .update({ total_amount: breakdown.totalPrice })
          .eq("id", orderId);
      }
    } catch (e) {
      // ignore errors
    }

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
      .select("user_id")
      .eq("user_id", userId)
      .single();

    if (!buyerData) {
      return res.status(404).json({ message: "Buyer profile not found" });
    }
    const buyerId = buyerData.user_id;

    // 2. Verify order belongs to buyer
    const { data: order } = await supabase
      .from("placed_orders")
      .select("*")
      .eq("id", orderId)
      .eq("buyer_id", buyerId)
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
        order.quantity.toString(),
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
      .select("user_id")
      .eq("user_id", userId)
      .single();

    if (buyerError || !buyerData) {
      return res.status(404).json({ message: "Buyer profile not found" });
    }
    const buyerId = buyerData.user_id;

    // Get all orders for this buyer
    const { data: orders, error: ordersError } = await supabase
      .from("placed_orders")
      .select("*")
      .eq("buyer_id", buyerId)
      .order("created_at", { ascending: false });

    if (ordersError) throw new Error(ordersError.message);

    // enrich each order with price info
    const today = new Date().toISOString().split("T")[0];
    for (const ord of orders || []) {
      await ensureDistance(ord);
      try {
        const unit = await fetchUnitPrice(
          ord.fruit_type,
          ord.variant,
          ord.grade,
          today,
        );
        ord.unitPrice = unit;
        const breakdown = calculatePrice(ord, unit);
        Object.assign(ord, breakdown);
      } catch (e) {
        ord.unitPrice = null;
        ord.basePrice = null;
        ord.serviceCharge = null;
        ord.deliveryFee = null;
        ord.totalPrice = null;
      }
    }

    console.log("getMyOrders returning", orders);

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

// GET: Get detailed order information (similar to frontend fetchOrderDetails)
const getOrderDetails = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { orderId } = req.params;

    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    // Get buyer ID
    const { data: buyerData, error: buyerError } = await supabase
      .from("buyers")
      .select("user_id")
      .eq("user_id", userId)
      .single();

    if (buyerError || !buyerData) {
      return res.status(404).json({ message: "Buyer profile not found" });
    }
    const buyerId = buyerData.user_id;

    // Get order
    const { data: orderData, error: orderError } = await supabase
      .from("placed_orders")
      .select("*")
      .eq("id", orderId)
      .eq("buyer_id", buyerId)
      .single();

    if (orderError || !orderData) {
      return res.status(404).json({ message: "Order not found" });
    }

    // Add dummy farmer_accepted_at if order is matched/accepted
    if (
      orderData &&
      !orderData.farmer_accepted_at &&
      (orderData.status === "MATCHED" ||
        orderData.status === "PENDING_BUYER" ||
        orderData.status === "PENDING_FARMER" ||
        orderData.status === "AWAITING_PAYMENT" ||
        orderData.status === "PAID_PENDING_DELIVERY" ||
        orderData.status === "IN_TRANSIT" ||
        orderData.status === "DELIVERED" ||
        orderData.status === "COMPLETED")
    ) {
      // Add 1-2 hours to created_at for dummy accepted time
      const createdTime = new Date(orderData.created_at).getTime();
      const acceptedTime = new Date(createdTime + 1.5 * 60 * 60 * 1000); // 1.5 hours later
      orderData.farmer_accepted_at = acceptedTime.toISOString();
    }

    let productImages = [];
    let harvestDate = null;

    // Fetch unit price from freshroute_prices table for today
    const today = new Date().toISOString().split("T")[0];
    const { data: priceData, error: priceError } = await supabase
      .from("freshroute_prices")
      .select("price")
      .eq("fruit_name", orderData.fruit_type)
      .eq("variety", orderData.variant)
      .eq("grade", orderData.grade)
      .eq("target_date", today)
      .limit(1)
      .single();

    // ignore missing price

    const unitPrice = priceData ? priceData.price : null;
    // compute breakdown values for frontend
    const basePrice = unitPrice != null ? unitPrice * orderData.quantity : null;
    const serviceCharge = basePrice != null ? basePrice * 0.01 : null;
    const distanceKm = orderData.distance_km || 0;
    // zero distance implies no delivery fee
    const deliveryFee = distanceKm * 35; // 35 LKR per km
    const totalPrice =
      basePrice != null ? basePrice + (serviceCharge || 0) + deliveryFee : null;

    // Fetch product images from estimated_stock if harvest_id exists
    if (orderData.harvest_id) {
      const { data: stockData } = await supabase
        .from("estimated_stock")
        .select("image_url, harvest_date, estimated_harvest_date")
        .eq("id", orderData.harvest_id)
        .single();

      if (stockData) {
        // Handle images
        if (stockData.image_url) {
          const images = Array.isArray(stockData.image_url)
            ? stockData.image_url
            : [stockData.image_url];
          productImages = images.filter((url) => url);
        }

        // Handle harvest date - use harvest_date if available, otherwise estimated_harvest_date
        harvestDate =
          stockData.harvest_date || stockData.estimated_harvest_date;
        if (!harvestDate) {
          // Add dummy harvest date for testing (3 days before order created)
          const createdTime = new Date(orderData.created_at).getTime();
          const dummyHarvestDate = new Date(
            createdTime - 3 * 24 * 60 * 60 * 1000,
          );
          harvestDate = dummyHarvestDate.toISOString().split("T")[0]; // yyyy-mm-dd format
        }
      } else {
        // If stockData is null, still set dummy harvest date
        const createdTime = new Date(orderData.created_at).getTime();
        const dummyHarvestDate = new Date(
          createdTime - 3 * 24 * 60 * 60 * 1000,
        );
        harvestDate = dummyHarvestDate.toISOString().split("T")[0]; // yyyy-mm-dd format
      }
    } else {
      // If no harvest_id, add dummy harvest date
      const createdTime = new Date(orderData.created_at).getTime();
      const dummyHarvestDate = new Date(createdTime - 3 * 24 * 60 * 60 * 1000);
      harvestDate = dummyHarvestDate.toISOString().split("T")[0]; // yyyy-mm-dd format
    }

    let farmer = null;
    if (orderData.selected_farmer_id) {
      const { data: farmerData, error: farmerError } = await supabase
        .from("farmer")
        .select(
          `
          id,
          user_id,
          users:user_id (
            name,
            phone,
            email
          )
        `,
        )
        .eq("id", orderData.selected_farmer_id)
        .single();

      if (!farmerError && farmerData) {
        const userData = farmerData.users;
        farmer = {
          id: farmerData.id,
          name: userData?.name || "Unknown",
          phone: userData?.phone || "",
          rating: undefined,
          location: undefined,
        };
      }
    }

    return res.status(200).json({
      order: orderData,
      productImages,
      harvestDate,
      farmer,
      unitPrice,
      basePrice,
      serviceCharge,
      deliveryFee,
      totalPrice,
    });
  } catch (err) {
    console.error("GetOrderDetails Error:", err);
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
  getOrderDetails,
};
