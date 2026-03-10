const fs = require("fs").promises;
const path = require("path");
const { supabaseAdmin: supabase } = require("../../utils/supabaseClient");
const { getContract } = require("../../Services/blockchain/contractService");
const { submitWithTx } = require("../../utils/blockchainUtils");
const { runMatchingAlgorithm } = require("../../Services/matchingService");
const { calculateDistanceKm } = require("../../utils/logisticsUtils");
const { fetchUnitPrice, calculatePrice } = require("../../utils/pricingUtils");

// STEP 1: Buyer Posts a Request (Supabase Only)
const placeOrder = async (req, res) => {
  try {
    const userId = req.user && req.user.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    // wallet requirement
    const walletPath = path.join(process.cwd(), "wallet", `${userId}.id`);
    try {
      await fs.access(walletPath);
    } catch (walletErr) {
      return res.status(403).json({
        message:
          "Blockchain identity not found. Please register a wallet before placing an order.",
      });
    }

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
          status: "OPEN", // Initial status
        },
      ])
      .select("*")
      .single();

    if (insertError) throw new Error(insertError.message);

    // 3a. Optionally record the order on the blockchain via the OrderContract
    let blockchainTxId = null;
    try {
      const blockchainOrderId = `ORDER_${orderData.id}`;
      const { contract, close } = await getContract(userId, "OrderContract");
      const txId = await submitWithTx(
        contract,
        "PlaceOrder",
        blockchainOrderId,
        fruit_type,
        variant,
        grade,
        quantity.toString(),
        required_date,
      );
      await close();
      console.log("[Blockchain] Order placed on ledger", blockchainOrderId, "tx", txId);
      if (txId) {
        blockchainTxId = txId;
        // append to order record
        const { data: existingOrder } = await supabase
          .from("placed_orders")
          .select("blockchain_tx_id")
          .eq("id", orderData.id)
          .single();
        const arrExist = existingOrder?.blockchain_tx_id || [];
        const arr = Array.isArray(arrExist) ? arrExist : [arrExist];
        await supabase
          .from("placed_orders")
          .update({ blockchain_tx_id: [...arr, txId] })
          .eq("id", orderData.id);
      }
    } catch (bcErr) {
      console.error("[Blockchain] PlaceOrder failed:", bcErr.message);
      // continue, database is still valid
    }

    // 4. Run Matching Algorithm Immediately
    const matches = await runMatchingAlgorithm(orderData.id);

    // 5. Update status if matches found
    let finalStatus = "OPEN";
    if (matches && matches.length > 0) {
      finalStatus = "PENDING_BUYER";
      await supabase
        .from("placed_orders")
        .update({ status: finalStatus, updated_at: new Date().toISOString() })
        .eq("id", orderData.id);
    }

    // BEFORE returning, if a farmer has already been selected (unlikely on initial place)
    // fetch their pickup/location info so client can display coordinates.
    let farmerPickup = null;
    if (orderData.selected_farmer_id) {
      const { data: fpData, error: fpErr } = await supabase
        .from("farmers")
        .select("user_id,latitude,longitude,location")
        .eq("user_id", orderData.selected_farmer_id)
        .single();
      if (!fpErr && fpData) {
        farmerPickup = {
          latitude: fpData.latitude,
          longitude: fpData.longitude,
          location: fpData.location,
        };
      }
    }

    // RETURN matches immediately so Buyer can choose
    // If no matches now, cron job will retry every 2 hours
    return res.status(201).json({
      message:
        matches.length > 0
          ? "Order placed. Matches found! Please select a farmer."
          : "Order placed. No matches yet - we'll notify you when farmers are available.",
      order: { ...orderData, status: finalStatus, farmerPickup },
      matches: matches,
      blockchainTxId,
    });
  } catch (err) {
    console.error("PlaceOrder Error:", err);
    return res
      .status(500)
      .json({ message: "Server error", error: err.message });
  }
};

// PUT /api/buyer/orders/:orderId
// allow buyer to update quantity (and optionally grade) of an open order
const updateOrder = async (req, res) => {
  try {
    const userId = req.user && req.user.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    // check wallet
    const walletPath = path.join(process.cwd(), "wallet", `${userId}.id`);
    try {
      await fs.access(walletPath);
    } catch (walletErr) {
      return res.status(403).json({
        message:
          "Blockchain identity not found. Please register a wallet before updating an order.",
      });
    }

    const { orderId } = req.params;
    const { quantity, grade } = req.body;

    if (!orderId) return res.status(400).json({ message: "Order ID required" });
    if (quantity !== undefined && (!Number.isInteger(quantity) || quantity <= 0))
      return res.status(400).json({ message: "Invalid quantity" });

    // fetch existing order
    const { data: existingOrder, error: fetchErr } = await supabase
      .from("placed_orders")
      .select("*")
      .eq("id", orderId)
      .single();
    if (fetchErr || !existingOrder)
      return res.status(404).json({ message: "Order not found" });
    if (existingOrder.buyer_id !== userId)
      return res.status(403).json({ message: "Forbidden" });
    if (existingOrder.status === "CONFIRMED")
      return res.status(400).json({ message: "Cannot modify a confirmed order" });

    const updateData = {};
    if (quantity !== undefined) updateData.quantity = quantity;
    if (grade !== undefined) updateData.grade = grade;

    const { error: updErr } = await supabase
      .from("placed_orders")
      .update(updateData)
      .eq("id", orderId);
    if (updErr) throw new Error(updErr.message);

    // record change on blockchain
    let blockchainTxId = null;
    try {
      const blockchainOrderId = `ORDER_${orderId}`;
      const { contract, close } = await getContract(userId, "OrderContract");
      const txId = await submitWithTx(
        contract,
        "UpdateOrderQuantity",
        blockchainOrderId,
        (quantity || existingOrder.quantity).toString(),
      );
      await close();
      if (txId) {
        blockchainTxId = txId;
        const { data: ex } = await supabase
          .from("placed_orders")
          .select("blockchain_tx_id")
          .eq("id", orderId)
          .single();
        const arrExist = ex?.blockchain_tx_id || [];
        const arr = Array.isArray(arrExist) ? arrExist : [arrExist];
        await supabase
          .from("placed_orders")
          .update({ blockchain_tx_id: [...arr, txId] })
          .eq("id", orderId);
      }
    } catch (bcErr) {
      console.error("Blockchain UpdateOrder failed:", bcErr.message);
    }

    return res.status(200).json({ success: true, message: "Order updated", blockchainTxId });
  } catch (err) {
    console.error("UpdateOrder Error:", err);
    return res.status(500).json({ message: err.message });
  }
};

// DELETE /api/buyer/orders/:orderId
// buyer can cancel their order and remove it on-chain
const deleteOrder = async (req, res) => {
  try {
    const userId = req.user && req.user.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    // wallet check
    const walletPath = path.join(process.cwd(), "wallet", `${userId}.id`);
    try {
      await fs.access(walletPath);
    } catch (walletErr) {
      return res.status(403).json({
        message:
          "Blockchain identity not found. Please register a wallet before deleting an order.",
      });
    }

    const { orderId } = req.params;
    if (!orderId) return res.status(400).json({ message: "Order ID required" });
    const { data: existingOrder, error: fetchErr } = await supabase
      .from("placed_orders")
      .select("*")
      .eq("id", orderId)
      .single();
    if (fetchErr || !existingOrder)
      return res.status(404).json({ message: "Order not found" });
    if (existingOrder.buyer_id !== userId)
      return res.status(403).json({ message: "Forbidden" });

    // delete from Supabase
    const { error: delErr } = await supabase
      .from("placed_orders")
      .delete()
      .eq("id", orderId);
    if (delErr) throw new Error(delErr.message);

    // delete on blockchain
    let blockchainTxId = null;
    try {
      const { contract, close } = await getContract(userId, "OrderContract");
      const txId = await submitWithTx(contract, "DeleteOrder", `ORDER_${orderId}`);
      await close();
      console.log("[Blockchain] DeleteOrder tx", txId);
      blockchainTxId = txId;
    } catch (bcErr) {
      console.error("Blockchain DeleteOrder failed:", bcErr.message);
    }

    return res.status(200).json({ success: true, message: "Order deleted", blockchainTxId });
  } catch (err) {
    console.error("DeleteOrder Error:", err);
    return res.status(500).json({ message: err.message });
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

    // Batch-fetch distances from match_proposals for orders missing distance_km
    const missingDistanceIds = (orders || [])
      .filter((o) => !o.distance_km)
      .map((o) => o.id);

    let proposalDistances = {};
    if (missingDistanceIds.length > 0) {
      const { data: proposals } = await supabase
        .from("match_proposals")
        .select("order_id, distance_km")
        .in("order_id", missingDistanceIds)
        .not("distance_km", "is", null)
        .order("match_score", { ascending: false });

      (proposals || []).forEach((p) => {
        if (!proposalDistances[p.order_id]) {
          proposalDistances[p.order_id] = p.distance_km;
        }
      });

      // Backfill placed_orders so future calls don't need the fallback
      for (const [ordId, dist] of Object.entries(proposalDistances)) {
        await supabase
          .from("placed_orders")
          .update({ distance_km: dist })
          .eq("id", ordId);
      }
    }

    // Enrich each order with resolved distance + live price info
    const today = new Date().toISOString().split("T")[0];
    await Promise.all(
      (orders || []).map(async (ord) => {
        const distanceKm = ord.distance_km ?? proposalDistances[ord.id] ?? null;
        if (distanceKm != null) ord.distance_km = distanceKm;

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
      }),
    );

    // If any orders have a selected farmer, batch fetch pickup/location info
    const farmerIds = Array.from(
      new Set(
        (orders || [])
          .filter((o) => o.selected_farmer_id)
          .map((o) => o.selected_farmer_id),
      ),
    );
    if (farmerIds.length > 0) {
      const { data: farmerRecords, error: farmerErr } = await supabase
        .from("farmers")
        .select("user_id,latitude,longitude,location")
        .in("user_id", farmerIds);
      if (!farmerErr && farmerRecords) {
        const farmerMap = {};
        farmerRecords.forEach((f) => {
          farmerMap[f.user_id] = f;
        });
        orders.forEach((ord) => {
          if (ord.selected_farmer_id && farmerMap[ord.selected_farmer_id]) {
            ord.farmerPickup = {
              latitude: farmerMap[ord.selected_farmer_id].latitude,
              longitude: farmerMap[ord.selected_farmer_id].longitude,
              location: farmerMap[ord.selected_farmer_id].location,
            };
          }
        });
      }
    }

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
    const role = (req.user?.role || "").toLowerCase();
    const isAdmin = role === "admin";
    const { orderId } = req.params;

    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    let buyerId = null;
    if (!isAdmin) {
      const { data: buyerData, error: buyerError } = await supabase
        .from("buyers")
        .select("user_id")
        .eq("user_id", userId)
        .single();

      if (buyerError || !buyerData) {
        return res.status(404).json({ message: "Buyer profile not found" });
      }
      buyerId = buyerData.user_id;
    }

    // Get order (admin can view any order; buyer only their own)
    let query = supabase
      .from("placed_orders")
      .select("*")
      .eq("id", orderId);
    if (!isAdmin) query = query.eq("buyer_id", buyerId);
    const { data: orderData, error: orderError } = await query.single();

    if (orderError || !orderData) {
      return res.status(404).json({ message: "Order not found" });
    }

    // farmer_accepted_at is now explicitly set when a farmer accepts a proposal
    // (see farmer/proposalController), so there is no need to fabricate a value here.
    // Previous versions injected a dummy timestamp for older rows; if you still
    // encounter nulls they can be backfilled with a migration or left null.

    let productImages = [];
    let harvestDate = null;

    // Fetch today's market unit price for live breakdown display
    const today = new Date().toISOString().split("T")[0];
    const { data: priceData } = await supabase
      .from("freshroute_prices")
      .select("price")
      .eq("fruit_name", orderData.fruit_type)
      .eq("variety", orderData.variant)
      .eq("grade", orderData.grade)
      .eq("target_date", today)
      .limit(1)
      .single();

    const unitPrice = priceData ? priceData.price : null;
    const basePrice = unitPrice != null ? unitPrice * orderData.quantity : null;
    const serviceCharge = basePrice != null ? basePrice * 0.01 : null;

    // Resolve distance: placed_orders first, then match_proposals fallback
    let distanceKm = orderData.distance_km ?? null;
    if (!distanceKm && orderId) {
      const { data: mpData } = await supabase
        .from("match_proposals")
        .select("distance_km")
        .eq("order_id", orderId)
        .not("distance_km", "is", null)
        .order("match_score", { ascending: false })
        .limit(1)
        .single();
      if (mpData?.distance_km) {
        distanceKm = mpData.distance_km;
        // Backfill so future calls skip this lookup
        await supabase
          .from("placed_orders")
          .update({ distance_km: distanceKm })
          .eq("id", orderId);
        orderData.distance_km = distanceKm;
      }
    }
    // Final fallback: farmer ↔ buyer coords
    if (!distanceKm && orderData.selected_farmer_id) {
      const { data: farmerInfo } = await supabase
        .from("farmers")
        .select("latitude, longitude")
        .eq("user_id", orderData.selected_farmer_id)
        .single();
      if (farmerInfo?.latitude != null && orderData.latitude != null) {
        distanceKm = calculateDistanceKm(
          orderData.latitude,
          orderData.longitude,
          farmerInfo.latitude,
          farmerInfo.longitude,
        );
        await supabase
          .from("placed_orders")
          .update({ distance_km: distanceKm })
          .eq("id", orderId);
        orderData.distance_km = distanceKm;
      }
    }
    distanceKm = distanceKm || 0;

    const deliveryFee = distanceKm * 35;
    const totalPrice =
      basePrice != null ? basePrice + (serviceCharge || 0) + deliveryFee : null;
    // Note: orderData.total_amount is the price locked at farmer acceptance time (stored in DB)
    // unitPrice/basePrice/serviceCharge/deliveryFee/totalPrice above are today's live market prices

    // Fetch product images — try harvest_id first, then best ACCEPTED/PENDING proposal as fallback
    if (orderData.harvest_id) {
      const { data: stockData } = await supabase
        .from("estimated_stock")
        .select("image_url, estimated_harvest_date")
        .eq("id", orderData.harvest_id)
        .single();

      if (stockData) {
        if (stockData.image_url) {
          const images = Array.isArray(stockData.image_url)
            ? stockData.image_url
            : [stockData.image_url];
          productImages = images.filter(Boolean);
        }
        harvestDate = stockData.estimated_harvest_date || null;
      }
    }

    // Fallback: if no images yet, look them up via the matched/pending proposal → stock
    if (productImages.length === 0) {
      const { data: proposalStock } = await supabase
        .from("match_proposals")
        .select("stock:estimated_stock!stock_id(image_url, estimated_harvest_date)")
        .eq("order_id", orderId)
        .in("status", ["ACCEPTED", "PENDING_FARMER", "PENDING_BUYER"])
        .order("match_score", { ascending: false })
        .limit(1)
        .single();

      if (proposalStock?.stock) {
        const raw = proposalStock.stock.image_url;
        if (raw) {
          const images = Array.isArray(raw) ? raw : [raw];
          productImages = images.filter(Boolean);
        }
        if (!harvestDate) {
          harvestDate = proposalStock.stock.estimated_harvest_date || null;
        }
      }
    }

    // Final fallback for harvestDate: derive from created_at
    if (!harvestDate) {
      harvestDate = new Date(new Date(orderData.created_at).getTime() - 3 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];
    }

    let farmer = null;
    if (orderData.selected_farmer_id) {
      // fetch farmer record to confirm it exists
      const { data: farmerData, error: farmerError } = await supabase
        .from("farmers")
        .select("user_id")
        .eq("user_id", orderData.selected_farmer_id)
        .single();

      if (farmerError || !farmerData) {
        // farmer record missing; leave farmer null
      } else {
        // separately query users table for profile info
        const { data: userInfo } = await supabase
          .from("users")
          .select("first_name,last_name,phone,email")
          .eq("id", orderData.selected_farmer_id)
          .single();

        farmer = {
          id: orderData.selected_farmer_id,
          name: userInfo
            ? `${userInfo.first_name || ""} ${userInfo.last_name || ""}`.trim() ||
              "Unknown"
            : "Unknown",
          phone: userInfo?.phone || "",
          rating: undefined,
          // include pickup location details pulled from farmers table
          latitude: farmerData.latitude,
          longitude: farmerData.longitude,
          location: farmerData.location,
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
  updateOrder,
  deleteOrder,
  getMyOrders,
  getOrderDetails,
};
