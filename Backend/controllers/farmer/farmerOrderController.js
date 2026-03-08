const { supabaseAdmin: supabase } = require("../../utils/supabaseClient");
const { sendSystemNotification } = require("../../Services/notificationsService");
const { fetchUnitPrice, calculateFarmerPrice } = require("../../utils/pricingUtils");

// PATCH /api/farmer/orders/:orderId/packing
// Transitions an order from AUTHORIZED_PAYMENT → PACKING once farmer starts packing.
const updateOrderStatusPacking = async (req, res) => {
  try {
    const userId = req.user.id;
    const { orderId } = req.params;

    const { data: order } = await supabase
      .from("placed_orders")
      .select("id, status, selected_farmer_id")
      .eq("id", orderId)
      .eq("selected_farmer_id", userId)
      .single();

    if (!order)
      return res.status(404).json({ message: "Order not found or not assigned to you" });
    if (order.status !== "AUTHORIZED_PAYMENT")
      return res.status(400).json({
        message: `Expected AUTHORIZED_PAYMENT, current status is: ${order.status}`,
      });

    await supabase
      .from("placed_orders")
      .update({ status: "PACKING", updated_at: new Date().toISOString() })
      .eq("id", orderId);

    // Notify buyer that farmer has started packing
    try {
      // fetch buyer id for order
      const { data: ord } = await supabase
        .from("placed_orders")
        .select("buyer_id")
        .eq("id", orderId)
        .single();
      if (ord && ord.buyer_id) {
        await sendSystemNotification(ord.buyer_id, {
          message: `Farmer has started packing your order ${orderId}.`,
          severity: "info",
        });
      }
    } catch (notifErr) {
      console.warn("Failed to notify buyer about packing:", notifErr.message);
    }

    return res.status(200).json({ success: true, orderId, status: "PACKING" });
  } catch (err) {
    console.error("UpdateOrderStatusPacking Error:", err);
    return res.status(500).json({ message: err.message });
  }
};

// PATCH /api/farmer/orders/:orderId/ready
// Transitions an order from PACKING → READY_FOR_PICKUP once farmer is done packing.
const updateOrderStatusReady = async (req, res) => {
  try {
    const userId = req.user.id;
    const { orderId } = req.params;

    const { data: order } = await supabase
      .from("placed_orders")
      .select("id, status, selected_farmer_id")
      .eq("id", orderId)
      .eq("selected_farmer_id", userId)
      .single();

    if (!order)
      return res.status(404).json({ message: "Order not found or not assigned to you" });
    if (order.status !== "PACKING")
      return res.status(400).json({
        message: `Expected PACKING, current status is: ${order.status}`,
      });

    await supabase
      .from("placed_orders")
      .update({ status: "READY_FOR_PICKUP", updated_at: new Date().toISOString() })
      .eq("id", orderId);

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

    return res.status(200).json({ success: true, orderId, status: "READY_FOR_PICKUP" });
  } catch (err) {
    console.error("UpdateOrderStatusReady Error:", err);
    return res.status(500).json({ message: err.message });
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
        "AWAITING_PAYMENT",   // <-- ADDED THIS (So it appears after farmer accepts)
        "AUTHORIZED_PAYMENT",
        "PACKING",
        "READY_FOR_PICKUP",
        "PICKED_UP",          // <-- ADDED THIS (So it doesn't disappear when truck arrives)
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

module.exports = { updateOrderStatusPacking, updateOrderStatusReady, getFarmerOrders };