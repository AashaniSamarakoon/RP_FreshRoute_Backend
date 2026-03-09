const { supabaseAdmin: supabase } = require("../../utils/supabaseClient");
const { sendSystemNotification } = require("../../Services/notificationsService");
const { fetchUnitPrice, calculateFarmerPrice } = require("../../utils/pricingUtils");

// (legacy) PATCH /api/farmer/orders/:orderId/packing
// This step has been removed; orders now jump directly to READY_FOR_PICKUP.
// The route is kept for backward compatibility and simply forwards to the
// ready endpoint.
const updateOrderStatusPacking = async (req, res) => {
  // forward request to the ready handler
  return updateOrderStatusReady(req, res);
};

// PATCH /api/farmer/orders/:orderId/ready
// Transitions an order to READY_FOR_PICKUP.  Previously this required a
// PACKING status but the workflow now skips packing; we accept either
// AUTHORIZED_PAYMENT or PACKING for backwards compatibility.
const updateOrderStatusReady = async (req, res) => {
  try {
    const userId = req.user.id;
    const { orderId } = req.params;
    console.log(`[Farmer] updateOrderStatusReady called by farmer ${userId} for order ${orderId}`);

    const { data: order } = await supabase
      .from("placed_orders")
      .select("id, status, selected_farmer_id")
      .eq("id", orderId)
      .eq("selected_farmer_id", userId)
      .single();

    if (!order)
      return res.status(404).json({ message: "Order not found or not assigned to you" });
    if (order.status !== "PACKING" && order.status !== "AUTHORIZED_PAYMENT")
      return res.status(400).json({
        message: `Expected PACKING or AUTHORIZED_PAYMENT, current status is: ${order.status}`,
      });

    const { data: updatedRows, error: updateErr } = await supabase
      .from("placed_orders")
      .update({
        status: "READY_FOR_PICKUP",
        ready_for_pickup_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId)
      .select("id,status,payment_status,ready_for_pickup_at");

    if (updateErr) {
      console.error("Failed to mark order ready:", updateErr.message);
      return res.status(500).json({
        success: false,
        message: "Database error updating order status",
        error: updateErr.message,
      });
    }

    if (!updatedRows || updatedRows.length === 0) {
      console.warn("Order ready update matched no rows?", orderId);
      return res.status(404).json({
        success: false,
        message: "Order not found when trying to mark ready",
      });
    }

    const updatedOrder = updatedRows[0];

    // Notify buyer that order is ready for pickup
    try {
      const { data: ord } = await supabase
        .from("placed_orders")
        .select("buyer_id")
        .eq("id", orderId)
        .single();
      if (ord && ord.buyer_id) {
        await sendSystemNotification(ord.buyer_id, {
          message: `Your order ${orderId} is ready for pickup from the farmer.`,
          severity: "info",
        });
      }
    } catch (notifErr) {
      console.warn("Failed to notify buyer about ready state:", notifErr.message);
    }

    return res.status(200).json({
      success: true,
      orderId,
      updatedOrder,
    });
  } catch (err) {
    console.error("UpdateOrderStatusReady Error:", err);
    return res.status(500).json({ message: err.message });
  }
};


// GET /api/farmer/orders/:orderId
// Fetch details for a single order assigned to the authenticated farmer
const getFarmerOrderById = async (req, res) => {
  try {
    const userId = req.user.id;
    const { orderId } = req.params;

    const { data: ord, error: fetchErr } = await supabase
      .from("placed_orders")
      .select("*")
      .eq("id", orderId)
      .eq("selected_farmer_id", userId)
      .single();

    if (fetchErr) throw fetchErr;
    if (!ord) {
      return res.status(404).json({ message: "Order not found or not assigned to you" });
    }

    // reuse enrichment logic from getFarmerOrders
    const today = new Date().toISOString().split("T")[0];
    let unit = null;
    try {
      unit = await fetchUnitPrice(ord.fruit_type, ord.variant, ord.grade, today);
    } catch (e) {
      // ignore errors fetching price
    }
    const breakdown = calculateFarmerPrice({ quantity: ord.quantity }, unit);

    // harvest images only – no fallback to proposals
    let productImages = [];
    let harvestDate = null;
    if (ord.harvest_id) {
      const { data: stockData } = await supabase
        .from("estimated_stock")
        .select("image_url, estimated_harvest_date")
        .eq("id", ord.harvest_id)
        .single();
      if (stockData) {
        if (stockData.image_url) {
          const imgs = Array.isArray(stockData.image_url)
            ? stockData.image_url
            : [stockData.image_url];
          productImages = imgs.filter(Boolean);
        }
        harvestDate = stockData.estimated_harvest_date || null;
      }
    }

    const enriched = {
      ...ord,
      pricing: { ...breakdown, unitPrice: unit },
      productImages,
      harvestDate,
    };

    return res.status(200).json({ order: enriched });
  } catch (err) {
    console.error("getFarmerOrderById error", err);
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};


// GET /api/farmer/orders
// Lists orders assigned to the authenticated farmer, starting from MATCHED
const getFarmerOrders = async (req, res) => {
  try {
    const userId = req.user.id;

    const { data: orders, error } = await supabase
      .from("placed_orders")
      .select("*")
      .eq("selected_farmer_id", userId)
      .in("status", [
        "MATCHED",
        "AWAITING_PAYMENT",   // appears after farmer accepts
        "AUTHORIZED_PAYMENT",
        // PACKING status is deprecated; orders now go straight to READY_FOR_PICKUP
        "READY_FOR_PICKUP",
        "PICKED_UP",          // so it doesn't disappear when truck arrives
      ])
      .order("created_at", { ascending: false });

    if (error) throw error;

    const today = new Date().toISOString().split("T")[0];
    const enriched = await Promise.all(
      (orders || []).map(async (ord) => {
        // compute unit price and farmer breakdown
        let unit = null;
        try {
          unit = await fetchUnitPrice(ord.fruit_type, ord.variant, ord.grade, today);
        } catch (e) {
          // ignore
        }
        const breakdown = calculateFarmerPrice({ quantity: ord.quantity }, unit);

        // harvest images only – no fallback to proposals
        let productImages = [];
        let harvestDate = null;
        if (ord.harvest_id) {
          const { data: stockData } = await supabase
            .from("estimated_stock")
            .select("image_url, estimated_harvest_date")
            .eq("id", ord.harvest_id)
            .single();
          if (stockData) {
            if (stockData.image_url) {
              const imgs = Array.isArray(stockData.image_url)
                ? stockData.image_url
                : [stockData.image_url];
              productImages = imgs.filter(Boolean);
            }
            harvestDate = stockData.estimated_harvest_date || null;
          }
        }

        return {
          ...ord,
          pricing: { ...breakdown, unitPrice: unit },
          productImages,
          harvestDate,
        };
      }),
    );

    return res.status(200).json({ orders: enriched });
  } catch (err) {
    console.error("getFarmerOrders error", err);
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

module.exports = { updateOrderStatusPacking, updateOrderStatusReady, getFarmerOrders, getFarmerOrderById };