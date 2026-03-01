const { supabase } = require("../../utils/supabaseClient");
const { sendNotification } = require("../../Services/notificationService");

/**
 * Get all pending payment slips for admin review
 * Route: GET /api/admin/payment-slips/pending
 * Access: Private (Admin only)
 */
const getPendingPaymentSlips = async (req, res) => {
  try {
    const { page = 1, limit = 20, status = "FLAGGED" } = req.query;
    const offset = (page - 1) * limit;

    // Valid statuses for review
    const validStatuses = ["PENDING", "FLAGGED"];
    const filterStatus = validStatuses.includes(status) ? status : "FLAGGED";

    const {
      data: payments,
      error,
      count,
    } = await supabase
      .from("payments")
      .select(
        `
        id,
        order_id,
        buyer_id,
        amount,
        currency,
        payment_slip_url,
        slip_uploaded_at,
        slip_ocr_data,
        slip_verification_status,
        slip_verification_notes,
        slip_image_hash,
        upload_metadata,
        users:buyer_id (
          user_metadata
        ),
        placed_orders:order_id (
          id,
          status,
          total_amount,
          created_at
        )
      `,
        { count: "exact" },
      )
      .eq("slip_verification_status", filterStatus)
      .order("slip_uploaded_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error("Get pending slips error:", error);
      return res.status(500).json({
        message: "Failed to fetch pending slips",
        error: error.message,
      });
    }

    res.status(200).json({
      payments,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    console.error("Get pending slips error:", error);
    res
      .status(500)
      .json({ message: "Failed to fetch pending slips", error: error.message });
  }
};

/**
 * Get payment slip details by ID
 * Route: GET /api/admin/payment-slips/:paymentId
 * Access: Private (Admin only)
 */
const getPaymentSlipDetails = async (req, res) => {
  try {
    const { paymentId } = req.params;

    const { data: payment, error } = await supabase
      .from("payments")
      .select(
        `
        *,
        users:buyer_id (
          id,
          user_metadata
        ),
        placed_orders:order_id (
          id,
          status,
          total_amount,
          created_at,
          buyer_id,
          farmer_id
        )
      `,
      )
      .eq("id", paymentId)
      .single();

    if (error || !payment) {
      return res.status(404).json({ message: "Payment not found" });
    }

    res.status(200).json({ payment });
  } catch (error) {
    console.error("Get slip details error:", error);
    res
      .status(500)
      .json({ message: "Failed to fetch slip details", error: error.message });
  }
};

/**
 * Approve payment slip
 * Route: POST /api/admin/payment-slips/:paymentId/approve
 * Access: Private (Admin only)
 */
const approvePaymentSlip = async (req, res) => {
  try {
    const { paymentId } = req.params;
    const { notes } = req.body;
    const adminId = req.user.userId;

    // Get payment details
    const { data: payment, error: fetchError } = await supabase
      .from("payments")
      .select("id, order_id, buyer_id, amount, slip_verification_status")
      .eq("id", paymentId)
      .single();

    if (fetchError || !payment) {
      return res.status(404).json({ message: "Payment not found" });
    }

    if (!["PENDING", "FLAGGED"].includes(payment.slip_verification_status)) {
      return res.status(400).json({
        message: `Cannot approve payment with status: ${payment.slip_verification_status}`,
      });
    }

    // Update payment status
    const { data: updated, error: updateError } = await supabase
      .from("payments")
      .update({
        slip_verification_status: "APPROVED",
        slip_verified_by: adminId,
        slip_verified_at: new Date().toISOString(),
        slip_verification_notes: notes || "Approved by admin",
        status: "AUTHORIZED",
        authorized_at: new Date().toISOString(),
      })
      .eq("id", paymentId)
      .select()
      .single();

    if (updateError) {
      console.error("Approval update error:", updateError);
      return res.status(500).json({ message: "Failed to approve payment" });
    }

    // Update order status
    const { error: orderError } = await supabase
      .from("placed_orders")
      .update({
        status: "PAID_PENDING_DELIVERY",
        payment_status: "AUTHORIZED",
      })
      .eq("id", payment.order_id);

    if (orderError) {
      console.error("Order update error:", orderError);
    }

    // Send notification to buyer
    try {
      await sendNotification(payment.buyer_id, {
        title: "✅ Payment Approved",
        body: `Your payment of LKR ${payment.amount.toLocaleString()} for Order #${payment.order_id} has been verified and approved.`,
        category: "payment",
        severity: "success",
      });
    } catch (error) {
      console.log(
        "⚠️  Skipping notification (table constraint issue):",
        error.message,
      );
    }

    // Log approval for audit trail
    console.log(
      `[AUDIT] Payment ${paymentId} approved by admin ${adminId} for order ${payment.order_id}`,
    );

    res.status(200).json({
      message: "Payment slip approved successfully",
      payment: updated,
    });
  } catch (error) {
    console.error("Approve slip error:", error);
    res.status(500).json({
      message: "Failed to approve payment slip",
      error: error.message,
    });
  }
};

/**
 * Reject payment slip
 * Route: POST /api/admin/payment-slips/:paymentId/reject
 * Access: Private (Admin only)
 */
const rejectPaymentSlip = async (req, res) => {
  try {
    const { paymentId } = req.params;
    const { reason } = req.body;
    const adminId = req.user.userId;

    if (!reason) {
      return res.status(400).json({ message: "Rejection reason is required" });
    }

    // Get payment details
    const { data: payment, error: fetchError } = await supabase
      .from("payments")
      .select("id, order_id, buyer_id, amount, slip_verification_status")
      .eq("id", paymentId)
      .single();

    if (fetchError || !payment) {
      return res.status(404).json({ message: "Payment not found" });
    }

    if (!["PENDING", "FLAGGED"].includes(payment.slip_verification_status)) {
      return res.status(400).json({
        message: `Cannot reject payment with status: ${payment.slip_verification_status}`,
      });
    }

    // Update payment status
    const { data: updated, error: updateError } = await supabase
      .from("payments")
      .update({
        slip_verification_status: "REJECTED",
        slip_verified_by: adminId,
        slip_verified_at: new Date().toISOString(),
        slip_verification_notes: reason,
        status: "FAILED",
      })
      .eq("id", paymentId)
      .select()
      .single();

    if (updateError) {
      console.error("Rejection update error:", updateError);
      return res.status(500).json({ message: "Failed to reject payment" });
    }

    // Send notification to buyer
    try {
      await sendNotification(payment.buyer_id, {
        title: "❌ Payment Slip Rejected",
        body: `Your payment slip for Order #${payment.order_id} was rejected. Reason: ${reason}. Please upload a new slip.`,
        category: "payment",
        severity: "error",
      });
    } catch (error) {
      console.log(
        "⚠️  Skipping notification (table constraint issue):",
        error.message,
      );
    }

    // Log rejection for audit trail
    console.log(
      `[AUDIT] Payment ${paymentId} rejected by admin ${adminId} for order ${payment.order_id}. Reason: ${reason}`,
    );

    res.status(200).json({
      message: "Payment slip rejected",
      payment: updated,
    });
  } catch (error) {
    console.error("Reject slip error:", error);
    res
      .status(500)
      .json({ message: "Failed to reject payment slip", error: error.message });
  }
};

/**
 * Get payment slip statistics
 * Route: GET /api/admin/payment-slips/stats
 * Access: Private (Admin only)
 */
const getPaymentSlipStats = async (req, res) => {
  try {
    const { data: stats, error } = await supabase.rpc("get_payment_slip_stats");

    if (error) {
      // Fallback to manual counting if RPC doesn't exist
      const { data: allPayments } = await supabase
        .from("payments")
        .select("slip_verification_status, amount")
        .eq("payment_method", "bank_slip");

      const manualStats = {
        total: allPayments?.length || 0,
        pending:
          allPayments?.filter((p) => p.slip_verification_status === "PENDING")
            .length || 0,
        flagged:
          allPayments?.filter((p) => p.slip_verification_status === "FLAGGED")
            .length || 0,
        approved:
          allPayments?.filter((p) => p.slip_verification_status === "APPROVED")
            .length || 0,
        auto_approved:
          allPayments?.filter(
            (p) => p.slip_verification_status === "AUTO_APPROVED",
          ).length || 0,
        rejected:
          allPayments?.filter((p) => p.slip_verification_status === "REJECTED")
            .length || 0,
        total_amount:
          allPayments?.reduce(
            (sum, p) => sum + (parseFloat(p.amount) || 0),
            0,
          ) || 0,
      };

      return res.status(200).json({ stats: manualStats });
    }

    res.status(200).json({ stats });
  } catch (error) {
    console.error("Get stats error:", error);
    res
      .status(500)
      .json({ message: "Failed to fetch statistics", error: error.message });
  }
};

/**
 * Get fraud alerts (multiple rejections, duplicate slips, etc.)
 * Route: GET /api/admin/payment-slips/fraud-alerts
 * Access: Private (Admin only)
 */
const getFraudAlerts = async (req, res) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Find buyers with multiple rejected slips in last 30 days
    const { data: rejectedSlips, error: rejectedError } = await supabase
      .from("payments")
      .select(
        "buyer_id, id, order_id, slip_uploaded_at, users:buyer_id(user_metadata)",
      )
      .eq("slip_verification_status", "REJECTED")
      .gte("slip_uploaded_at", thirtyDaysAgo.toISOString());

    if (rejectedError) {
      console.error("Fraud check error:", rejectedError);
      return res.status(500).json({ message: "Failed to check fraud alerts" });
    }

    // Group by buyer and count rejections
    const buyerRejections = {};
    rejectedSlips?.forEach((slip) => {
      if (!buyerRejections[slip.buyer_id]) {
        buyerRejections[slip.buyer_id] = {
          buyerId: slip.buyer_id,
          buyerName: slip.users?.user_metadata?.name || "Unknown",
          rejections: [],
          count: 0,
        };
      }
      buyerRejections[slip.buyer_id].rejections.push({
        paymentId: slip.id,
        orderId: slip.order_id,
        uploadedAt: slip.slip_uploaded_at,
      });
      buyerRejections[slip.buyer_id].count++;
    });

    // Filter buyers with 3+ rejections
    const fraudAlerts = Object.values(buyerRejections)
      .filter((buyer) => buyer.count >= 3)
      .sort((a, b) => b.count - a.count);

    res.status(200).json({
      alerts: fraudAlerts,
      highRiskCount: fraudAlerts.length,
      totalRejected: rejectedSlips?.length || 0,
    });
  } catch (error) {
    console.error("Get fraud alerts error:", error);
    res
      .status(500)
      .json({ message: "Failed to fetch fraud alerts", error: error.message });
  }
};

module.exports = {
  getPendingPaymentSlips,
  getPaymentSlipDetails,
  approvePaymentSlip,
  rejectPaymentSlip,
  getPaymentSlipStats,
  getFraudAlerts,
};
