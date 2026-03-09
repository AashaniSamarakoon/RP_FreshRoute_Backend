const { supabaseAdmin: supabase } = require("../../utils/supabaseClient");
const { getContract } = require("../../Services/blockchain/contractService");
const axios = require("axios");
const { fetchUnitPrice } = require("../../utils/pricingUtils");
const { sendSystemNotification } = require("../../Services/notificationsService");


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
      throw new Error("Failed to update placed_orders: " + updateError.message);
    }

    // Sync status with core orders table
    const { data: mainOrder, error: mainOrderError } = await supabase
       .from("orders")
       .update({
           status: "delivered", // lowercase per general convention in orders table
           updated_at: new Date().toISOString()
       })
       .eq("placed_order_id", orderId)
       .select("assigned_job_id")
       .single();

    if (!mainOrderError && mainOrder && mainOrder.assigned_job_id) {
       // Update Route Manifest to mark this drop as completed
       const { data: jobData } = await supabase
          .from("transport_jobs")
          .select("route_manifest")
          .eq("id", mainOrder.assigned_job_id)
          .single();
          
       if (jobData && jobData.route_manifest) {
          const updatedManifest = jobData.route_manifest.map(stop => {
             if (stop.order_id === mainOrder.id && stop.type === 'DROP') {
                return { ...stop, completed: true, completed_at: new Date().toISOString() };
             }
             return stop;
          });
          
          await supabase
             .from("transport_jobs")
             .update({ route_manifest: updatedManifest })
             .eq("id", mainOrder.assigned_job_id);
       }

       // Check if all orders on this job are delivered to close the job
       const { data: jobOrders } = await supabase
          .from("orders")
          .select("status")
          .eq("assigned_job_id", mainOrder.assigned_job_id);
       
       const allDelivered = jobOrders?.every(o => o.status === 'delivered');
       if (allDelivered) {
          await supabase
             .from("transport_jobs")
             .update({ status: "COMPLETED", completed_at: new Date().toISOString() })
             .eq("id", mainOrder.assigned_job_id);
       }
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

    // before releasing funds to farmer we may need to capture the remaining balance
    // if customer-token deposit flow was used
    let captureSucceeded = true;
    if (order.payhere_customer_token) {
      // compute the remaining amount based on current market price for the pickup date
      const useDate = order.required_date || new Date().toISOString().split("T")[0];
      const unitPrice = await fetchUnitPrice(
        order.fruit_type,
        order.variant,
        order.grade,
        useDate,
      );
      const base = (unitPrice || 0) * (order.quantity || 0);
      const serviceCharge = base * 0.01; // 1% service fee
      const finalTotal = base + serviceCharge + (order.transporter_fee_amount || 0);
      const depositPaid = parseFloat(order.deposit_paid || 0);
      const remaining = finalTotal - depositPaid;

      if (remaining > 0) {
        console.log(
          `[PayHere] Attempting automatic capture of remaining ${remaining.toFixed(
            2,
          )} for order ${orderId}`,
        );
        try {
          const resp = await axios.post(
            `${process.env.PAYHERE_BASE_URL || "https://sandbox.payhere.lk"}/pay/checkout`,
            {
              merchant_id: process.env.PAYHERE_MERCHANT_ID,
              order_id: orderId,
              amount: remaining.toFixed(2),
              currency: "LKR",
              customer_token: order.payhere_customer_token,
            },
          );
          if (resp.data && resp.data.status !== "success") {
            throw new Error(
              `capture response not success: ${JSON.stringify(resp.data)}`,
            );
          }
          // update payments record for final capture
          const now = new Date().toISOString();
          await supabase
            .from("payments")
            .update({
              amount: finalTotal,
              status: "RELEASED",
              updated_at: now,
              released_at: now,
            })
            .eq("order_id", orderId);
          console.log("[PayHere] Final charge succeeded");
          captureSucceeded = true;
        } catch (err) {
          console.error("[PayHere] Automatic final charge failed:", err.message);
          captureSucceeded = false;
          await supabase
            .from("placed_orders")
            .update({
              status: "PAYMENT_FAILED",
              payment_status: "FAILED",
              updated_at: new Date().toISOString(),
            })
            .eq("id", orderId);
          // notify buyer about failure
          await sendSystemNotification(order.buyer_id, {
            message:
              "Final payment attempt failed - please re-authorize your card.",
            severity: "critical",
          });
          return res.status(200).json({
            success: false,
            message: "Final charge failed, buyer notified",
          });
        }
      }
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

    // Update order status depending on whether we already charged final balance
    const newOrderStatus =
      captureSucceeded && order.payhere_customer_token ? "COMPLETED" : "IN_TRANSIT";
    await supabase
      .from("placed_orders")
      .update({
        status: newOrderStatus,
        payment_status: "RELEASED",
        quality_confirmed_at: new Date().toISOString(),
        picked_up_at: new Date().toISOString(),
        pickup_notes: pickupNotes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId);

    // Sync status with core orders table
    const { data: mainOrder, error: mainOrderErr } = await supabase
       .from("orders")
       .update({
           status: "in_transit",
           updated_at: new Date().toISOString()
       })
       .eq("placed_order_id", orderId)
       .select("assigned_job_id")
       .single();

    if (!mainOrderErr && mainOrder && mainOrder.assigned_job_id) {
        // Mark job as in progress if this is the first pickup
        await supabase
           .from("transport_jobs")
           .update({ status: "IN_PROGRESS" })
           .eq("id", mainOrder.assigned_job_id)
           .eq("status", "SCHEDULED"); // Only update if it's currently scheduled
           
        // Update Route Manifest to mark this pickup as completed
        const { data: jobData } = await supabase
           .from("transport_jobs")
           .select("route_manifest")
           .eq("id", mainOrder.assigned_job_id)
           .single();
           
        if (jobData && jobData.route_manifest) {
           const updatedManifest = jobData.route_manifest.map(stop => {
              if (stop.order_id === mainOrder.id && stop.type === 'PICKUP') {
                 return { ...stop, completed: true, completed_at: new Date().toISOString() };
              }
              return stop;
           });
           
           await supabase
              .from("transport_jobs")
              .update({ route_manifest: updatedManifest })
              .eq("id", mainOrder.assigned_job_id);
        }
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
        orderStatus:
          captureSucceeded && order.payhere_customer_token ? "COMPLETED" : "IN_TRANSIT",
        paymentStatus: "RELEASED",
        pickedUpAt: new Date().toISOString(),
        note:
          captureSucceeded && order.payhere_customer_token
            ? "Final charge succeeded - order completed and receipt generated."
            : "Payment released to farmer. Goods are now in transit to buyer.",
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
