const { supabase } = require("../../utils/supabaseClient");

/**
 * GET /api/admin/temps/:orderId
 * orderId = placed_order_id (the id from placed_orders / frontend order).
 * Find rows in orders where placed_order_id = orderId, get their id, then get alerts where order_id in those ids.
 * Returns temp-related alerts (e.g. HIGH_TEMP) for that order. Auth: admin.
 */
const getTempsByOrderId = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { orderId } = req.params;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    if (!orderId) {
      return res.status(400).json({ success: false, message: "orderId is required" });
    }

    const { data: orders, error: ordersError } = await supabase
      .from("orders")
      .select("id")
      .eq("placed_order_id", orderId);

    if (ordersError) {
      console.error("Admin get temps – fetch orders error:", ordersError);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch orders: " + ordersError.message,
      });
    }

    if (!orders || orders.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No transport orders found for this placed_order_id",
        order_id: orderId,
        alerts: [],
      });
    }

    const orderIds = orders.map((o) => o.id);
    const { data: alerts, error: alertsError } = await supabase
      .from("alerts")
      .select("*")
      .in("order_id", orderIds)
      .order("created_at", { ascending: false });

    if (alertsError) {
      console.error("Admin get temps – fetch alerts error:", alertsError);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch alerts: " + alertsError.message,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Temp details retrieved",
      order_id: orderId,
      alerts: alerts || [],
    });
  } catch (err) {
    console.error("Admin getTempsByOrderId error:", err);
    return res.status(500).json({ success: false, message: "Server error: " + err.message });
  }
};

module.exports = { getTempsByOrderId };
