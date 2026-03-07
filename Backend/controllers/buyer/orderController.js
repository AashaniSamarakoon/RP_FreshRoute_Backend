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
    try {
      const blockchainOrderId = `ORDER_${orderData.id}`;
      const { contract, close } = await getContract(userId, "OrderContract");
      await contract.submitTransaction(
        "PlaceOrder",
        blockchainOrderId,
        fruit_type,
        variant,
        grade,
        quantity.toString(),
        required_date,
      );
      await close();
      console.log("[Blockchain] Order placed on ledger", blockchainOrderId);
    } catch (bcErr) {
      console.error("[Blockchain] PlaceOrder failed:", bcErr.message);
      // continue, database is still valid
    }

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
    });
  } catch (err) {
    console.error("PlaceOrder Error:", err);
    return res
      .status(500)
      .json({ message: "Server error", error: err.message });
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
  getMyOrders,
  getOrderDetails,
};
