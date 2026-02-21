const { supabase } = require("../../utils/supabaseClient");

/**
 * Manual payment release endpoint (for admin use)
 * Route: POST /api/buyer/payment/release
 * Access: Private (Admin only)
 */
const releasePayment = async (req, res) => {
  try {
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({ message: "Order ID is required" });
    }

    // Get payment details
    const { data: payment, error: fetchError } = await supabase
      .from("payments")
      .select("id, order_id, status, amount, slip_verification_status")
      .eq("order_id", orderId)
      .single();

    if (fetchError || !payment) {
      return res
        .status(404)
        .json({ message: "Payment not found for this order" });
    }

    // Verify payment is authorized (slip auto-approved by OCR)
    if (
      payment.status !== "AUTHORIZED" &&
      payment.status !== "PENDING_RELEASE"
    ) {
      return res.status(400).json({
        message: `Cannot release payment with status: ${payment.status}. Must be AUTHORIZED or PENDING_RELEASE.`,
      });
    }

    // Verify slip was auto-approved (no manual approval in system)
    if (payment.slip_verification_status !== "AUTO_APPROVED") {
      return res.status(400).json({
        message: `Cannot release payment. Slip verification status: ${payment.slip_verification_status}. Must be AUTO_APPROVED.`,
      });
    }

    // Update payment to RELEASED
    const { data: updated, error: updateError } = await supabase
      .from("payments")
      .update({
        status: "RELEASED",
        released_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", payment.id)
      .select()
      .single();

    if (updateError) {
      console.error("Payment release update error:", updateError);
      return res.status(500).json({ message: "Failed to release payment" });
    }

    // Update order payment status
    await supabase
      .from("placed_orders")
      .update({ payment_status: "RELEASED" })
      .eq("id", orderId);

    console.log(
      `[PAYMENT] Payment ${payment.id} released for order ${orderId} by admin`,
    );

    res.status(200).json({
      success: true,
      message: "Payment released to farmer successfully",
      payment: updated,
    });
  } catch (error) {
    console.error("Release payment error:", error);
    res
      .status(500)
      .json({ message: "Failed to release payment", error: error.message });
  }
};

/**
 * Get payment status for an order
 * Route: GET /api/buyer/payment/status/:orderId
 * Access: Private (Buyer only)
 */
const getPaymentStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const buyerId = req.buyerId; // From getBuyerId middleware

    const { data: payment, error } = await supabase
      .from("payments")
      .select("*")
      .eq("order_id", orderId)
      .eq("buyer_id", buyerId)
      .single();

    if (error || !payment) {
      return res
        .status(404)
        .json({ message: "Payment not found for this order" });
    }

    res.status(200).json({
      orderId: payment.order_id,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      paymentMethod: payment.payment_method,
      slipVerificationStatus: payment.slip_verification_status,
      slipUrl: payment.payment_slip_url,
      uploadedAt: payment.slip_uploaded_at,
      verifiedAt: payment.slip_verified_at,
      authorizedAt: payment.authorized_at,
      releasedAt: payment.released_at,
      qualityConfirmedAt: payment.quality_confirmed_at,
    });
  } catch (error) {
    console.error("Get payment status error:", error);
    res
      .status(500)
      .json({ message: "Failed to get payment status", error: error.message });
  }
};

module.exports = {
  releasePayment,
  getPaymentStatus,
};
