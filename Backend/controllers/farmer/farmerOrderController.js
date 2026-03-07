const { supabaseAdmin: supabase } = require("../../utils/supabaseClient");

// PATCH /api/farmer/orders/:orderId/packing
// Transitions an order from PAID_PENDING_DELIVERY → PACKING once farmer starts packing.
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
    if (order.status !== "PAID_PENDING_DELIVERY")
      return res.status(400).json({
        message: `Expected PAID_PENDING_DELIVERY, current status is: ${order.status}`,
      });

    await supabase
      .from("placed_orders")
      .update({ status: "PACKING", updated_at: new Date().toISOString() })
      .eq("id", orderId);

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

    return res.status(200).json({ success: true, orderId, status: "READY_FOR_PICKUP" });
  } catch (err) {
    console.error("UpdateOrderStatusReady Error:", err);
    return res.status(500).json({ message: err.message });
  }
};

module.exports = { updateOrderStatusPacking, updateOrderStatusReady };
