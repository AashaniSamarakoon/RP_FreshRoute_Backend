const { supabaseAdmin: supabase } = require("../../utils/supabaseClient");
const { getContract } = require("../../Services/blockchain/contractService");
const axios = require("axios");

// Helper: Get transporter ID from user ID
// transporter table only stores user_id so we return that value directly
const getTransporterId = async (userId) => {
  const { data: transporterData, error: transporterError } = await supabase
    .from("transporter")
    .select("user_id")
    .eq("user_id", userId)
    .single();

  if (transporterError || !transporterData) {
    throw new Error("No transporter profile found.");
  }
  return transporterData.user_id;
};

// POST: Mark order as delivered (after pickup and transit)
const confirmDelivery = async (req, res) => {
  try {
    const userId = req.user.id;
    const { orderId, deliveryNotes, receivedBy } = req.body;

    const transporterId = await getTransporterId(userId);

    // Get order details
    const { data: order, error: orderError } = await supabase
      .from("placed_orders")
      .select("*, transporter_id")
      .eq("id", orderId)
      .single();

    if (orderError || !order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // Verify transporter is assigned to this order
    if (order.transporter_id !== transporterId) {
      return res.status(403).json({
        message: "You are not assigned to this order",
      });
    }

    // Verify order was picked up (payment already released to farmer)
    if (order.status !== "PICKED_UP" && order.status !== "IN_TRANSIT") {
      return res.status(400).json({
        message: `Cannot confirm delivery. Order must be picked up first. Current status: ${order.status}`,
      });
    }

    // Update order status to delivered
    const { error: updateError } = await supabase
      .from("placed_orders")
      .update({
        status: "DELIVERED",
        delivered_at: new Date().toISOString(),
        delivery_notes: deliveryNotes,
        received_by: receivedBy,
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId);

    if (updateError) {
      throw new Error("Failed to update order: " + updateError.message);
    }

    return res.status(200).json({
      success: true,
      message: "Delivery confirmed successfully. Order completed.",
      orderId: orderId,
      deliveredAt: new Date().toISOString(),
      note: "Payment was already released to farmer at pickup",
    });
  } catch (err) {
    console.error("ConfirmDelivery Error:", err);
    return res
      .status(500)
      .json({ message: "Server error", error: err.message });
  }
};

// POST: Confirm quality at pickup and trigger payment release
const confirmQualityAndPickup = async (req, res) => {
  try {
    const userId = req.user.id;
    const { orderId, qualityScore, qualityNotes, stockCondition, pickupNotes } =
      req.body;

    const transporterId = await getTransporterId(userId);

    // Get order details
    const { data: order, error: orderError } = await supabase
      .from("placed_orders")
      .select("*, transporter_id")
      .eq("id", orderId)
      .single();

    if (orderError || !order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // Verify transporter is assigned to this order
    if (order.transporter_id !== transporterId) {
      return res.status(403).json({
        message: "You are not assigned to this order",
      });
    }

    // Verify order is ready for pickup (payment authorized)
    if (
      order.status !== "AUTHORIZED_PAYMENT" &&
      order.payment_status !== "AUTHORIZED"
    ) {
      return res.status(400).json({
        message: `Order must have authorized payment. Current status: ${order.status}, payment: ${order.payment_status}`,
      });
    }

    // Record quality check AT PICKUP (before taking goods)
    const { error: qualityError } = await supabase
      .from("quality_checks")
      .insert([
        {
          order_id: orderId,
          transporter_id: transporterId,
          quality_score: qualityScore,
          quality_notes: qualityNotes,
          stock_condition: stockCondition,
          checked_at: new Date().toISOString(),
          check_location: "PICKUP", // Quality checked at farmer's location
        },
      ]);

    if (qualityError) {
      console.error("Quality check record failed:", qualityError);
      // Continue anyway
    }

    // Read price breakdown from order (persisted at proposal acceptance)
    const farmerShare    = order.farmer_share_amount    || 0;
    const transporterFee = order.transporter_fee_amount || 0;
    const platformFee    = order.platform_fee_amount    || 0;

    // Quality failure path — refund buyer, do not release to farmer
    const qualityFailed = stockCondition === "POOR" || parseFloat(qualityScore) < 2.0;
    if (qualityFailed) {
      try {
        const { contract, close } = await getContract(userId, "PaymentContract");
        await contract.submitTransaction("RefundPayment", `ORDER_${orderId}`, "Poor quality at pickup");
        await close();
      } catch (bcErr) {
        console.error("[Blockchain] RefundPayment failed:", bcErr.message);
      }

      await supabase.from("placed_orders").update({
        status: "QUALITY_FAILED",
        payment_status: "REFUND_PENDING",
        quality_confirmed_at: new Date().toISOString(),
        pickup_notes: pickupNotes,
        updated_at: new Date().toISOString(),
      }).eq("id", orderId);

      await supabase.from("payments").update({
        status: "REFUND_PENDING",
        updated_at: new Date().toISOString(),
      }).eq("order_id", orderId);

      return res.status(200).json({
        success: true,
        orderId,
        qualityScore,
        orderStatus: "QUALITY_FAILED",
        paymentStatus: "REFUND_PENDING",
        message: "Quality check failed. Buyer refund initiated.",
      });
    }

    // Initiate payment release on blockchain
    const blockchainOrderId = `ORDER_${orderId}`;
    const blockchainTransporterId = `TRANSPORTER_${transporterId}`;

    try {
      const { contract, close } = await getContract(userId, "PaymentContract");
      try {
        await contract.submitTransaction(
          "ReleasePayment",
          blockchainOrderId,
          blockchainTransporterId,
          farmerShare.toString(),
          transporterFee.toString(),
          platformFee.toString(),
        );
        console.log(
          "[Blockchain] Payment marked for release after quality check at pickup",
        );
      } finally {
        await close();
      }
    } catch (bcError) {
      console.error(
        "[Blockchain] Payment release marking failed:",
        bcError.message,
      );
      return res.status(500).json({
        message: "Failed to record payment release on blockchain",
        error: bcError.message,
      });
    }

    // Update payment status in database
    await supabase
      .from("payments")
      .update({
        status: "PENDING_RELEASE",
        quality_confirmed_by: transporterId,
        quality_confirmed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("order_id", orderId);

    // Update payment to RELEASED status (payment released at pickup)
    const { error: releaseError } = await supabase
      .from("payments")
      .update({
        status: "RELEASED",
        released_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("order_id", orderId);

    if (releaseError) {
      console.error("Payment release error:", releaseError.message);
      return res.status(500).json({
        message: "Failed to release payment",
        error: releaseError.message,
      });
    }

    // Update order to IN_TRANSIT status (picked up, payment released)
    await supabase
      .from("placed_orders")
      .update({
        status: "IN_TRANSIT",
        payment_status: "RELEASED",
        quality_confirmed_at: new Date().toISOString(),
        picked_up_at: new Date().toISOString(),
        pickup_notes: pickupNotes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId);

    // Generate QR / public verify URL (triggered at quality-confirmed pickup)
    if (order.harvest_id) {
      await supabase.from("placed_orders").update({
        public_verify_url: `https://app.freshroute.lk/verify/${order.harvest_id}`,
        qr_generated_at:   new Date().toISOString(),
      }).eq("id", orderId);
    }

    // Record blockchain confirmation of payment release
    try {
      // Record blockchain confirmation
      try {
        const { contract, close } = await getContract(
          userId,
          "PaymentContract",
        );
        try {
          await contract.submitTransaction(
            "ConfirmPaymentRelease",
            blockchainOrderId,
            "Bank slip verified - Quality confirmed",
          );
          console.log("[Blockchain] Payment release confirmed");
        } finally {
          await close();
        }
      } catch (bcError) {
        console.error(
          "[Blockchain] Release confirmation failed:",
          bcError.message,
        );
        // Continue anyway - payment is released in DB
      }

      return res.status(200).json({
        success: true,
        message:
          "Quality confirmed, goods picked up, and payment released to farmer successfully",
        orderId: orderId,
        qualityScore: qualityScore,
        orderStatus: "IN_TRANSIT",
        paymentStatus: "RELEASED",
        pickedUpAt: new Date().toISOString(),
        note: "Payment released to farmer. Goods are now in transit to buyer.",
      });
    } catch (bcError) {
      console.error("Blockchain confirmation failed:", bcError.message);
      // Payment is already released in DB, just log the blockchain error
      return res.status(200).json({
        success: true,
        message:
          "Quality confirmed, goods picked up, and payment released (blockchain pending)",
        orderId: orderId,
        qualityScore: qualityScore,
        orderStatus: "IN_TRANSIT",
        paymentStatus: "RELEASED",
        warning: releaseError.message,
        note: "Admin needs to manually complete payment release",
      });
    }
  } catch (err) {
    console.error("ConfirmQualityAndPickup Error:", err);
    return res
      .status(500)
      .json({ message: "Server error", error: err.message });
  }
};

// Get pickup and delivery status for an order
const getDeliveryStatus = async (req, res) => {
  try {
    const userId = req.user.id;
    const { orderId } = req.params;

    const transporterId = await getTransporterId(userId);

    const { data: order, error: orderError } = await supabase
      .from("placed_orders")
      .select(
        "id, status, picked_up_at, pickup_notes, delivered_at, delivery_notes, received_by, transporter_id",
      )
      .eq("id", orderId)
      .eq("transporter_id", transporterId)
      .single();

    if (orderError || !order) {
      return res
        .status(404)
        .json({ message: "Order not found or not assigned to you" });
    }

    // Get quality check if exists (done at pickup)
    const { data: qualityCheck } = await supabase
      .from("quality_checks")
      .select("*")
      .eq("order_id", orderId)
      .single();

    return res.status(200).json({
      order: order,
      qualityCheck: qualityCheck || null,
      hasQualityCheck: !!qualityCheck,
      isPicked: !!order.picked_up_at,
      isDelivered: !!order.delivered_at,
    });
  } catch (err) {
    console.error("GetDeliveryStatus Error:", err);
    return res
      .status(500)
      .json({ message: "Server error", error: err.message });
  }
};

module.exports = {
  confirmDelivery,
  confirmQualityAndPickup,
  getDeliveryStatus,
};
