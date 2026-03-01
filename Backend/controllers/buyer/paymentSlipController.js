const crypto = require("crypto");
const { supabase, supabaseAdmin } = require("../../utils/supabaseClient");
const {
  logPaymentSlipAudit,
  checkBuyerFraudStatus,
  calculateFraudScore,
} = require("../../Services/paymentSlipAuditService");
const {
  performOCR,
  optimizeImageForOCR,
  evaluateOCR,
  sendVerificationNotifications,
} = require("../../Services/ocrService");

/**
 * Upload and verify payment slip using OCR
 * Route: POST /api/buyer/payment/upload-slip
 * Access: Private (Buyer only)
 */
const uploadPaymentSlip = async (req, res) => {
  try {
    const { orderId } = req.body;
    const buyerId = req.buyerId; // From getBuyerId middleware
    const file = req.file;

    if (!file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    if (!orderId) {
      return res.status(400).json({ message: "Order ID is required" });
    }

    // 0. Check if buyer is blocked
    const fraudStatus = await checkBuyerFraudStatus(buyerId);
    if (fraudStatus.isBlocked) {
      return res.status(403).json({
        message: "Your account is blocked from uploading payment slips",
        reason: fraudStatus.blockReason,
      });
    }

    // 1. Verify order exists and belongs to buyer
    const { data: order, error: orderError } = await supabase
      .from("placed_orders")
      .select("id, buyer_id, total_amount, status")
      .eq("id", orderId)
      .eq("buyer_id", buyerId)
      .single();

    if (orderError || !order) {
      return res
        .status(404)
        .json({ message: "Order not found or access denied" });
    }

    if (order.status !== "AWAITING_PAYMENT") {
      return res.status(400).json({
        message: `Cannot upload slip for order with status: ${order.status}. Order must be in AWAITING_PAYMENT status.`,
      });
    }

    // 2. Check if payment record exists
    let { data: payment } = await supabase
      .from("payments")
      .select("*")
      .eq("order_id", orderId)
      .single();

    // 3. Generate image hash for duplicate detection
    const imageHash = crypto
      .createHash("sha256")
      .update(file.buffer)
      .digest("hex");

    // Check for duplicate slip
    const { data: duplicateSlip } = await supabase
      .from("payments")
      .select("id, order_id, slip_verification_status")
      .eq("slip_image_hash", imageHash)
      .neq("id", payment?.id || "00000000-0000-0000-0000-000000000000")
      .limit(1);

    if (duplicateSlip && duplicateSlip.length > 0) {
      return res.status(400).json({
        message: "This payment slip has already been uploaded",
        duplicateOrderId: duplicateSlip[0].order_id,
      });
    }

    // 4. Optimize image for OCR (convert to grayscale, enhance contrast)
    const optimizedImage = await optimizeImageForOCR(file.buffer);

    // 5. Upload to Supabase Storage (using admin client to bypass RLS)
    const fileName = `payment-slips/${orderId}_${Date.now()}_${file.originalname}`;
    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from("payment-slips")
      .upload(fileName, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      });

    if (uploadError) {
      console.error("Supabase upload error:", uploadError);
      return res.status(500).json({
        message: "Failed to upload image",
        error: uploadError.message,
      });
    }

    // Get public URL
    const {
      data: { publicUrl },
    } = supabaseAdmin.storage.from("payment-slips").getPublicUrl(fileName);

    // 6. Perform OCR extraction
    const ocrResult = await performOCR(optimizedImage, order.total_amount);

    // 6.5 Calculate fraud score
    const fraudScore = await calculateFraudScore(
      buyerId,
      imageHash,
      order.total_amount,
      ocrResult,
    );

    // 7. Determine verification status based on OCR confidence and rules
    const verificationResult = evaluateOCR(
      ocrResult,
      order.total_amount,
      fraudScore,
    );

    // 8. Collect upload metadata for fraud detection
    const uploadMetadata = {
      ip:
        req.ip ||
        req.headers["x-forwarded-for"] ||
        req.connection.remoteAddress,
      userAgent: req.headers["user-agent"],
      uploadedAt: new Date().toISOString(),
      fileSize: file.size,
      fileName: file.originalname,
    };

    // 9. Create or update payment record
    const paymentData = {
      order_id: orderId,
      buyer_id: buyerId,
      amount: order.total_amount,
      currency: "LKR",
      status: verificationResult.paymentStatus,
      payment_method: "bank_slip",
      payment_slip_url: publicUrl,
      slip_uploaded_at: new Date().toISOString(),
      slip_ocr_data: ocrResult,
      slip_verification_status: verificationResult.verificationStatus,
      slip_verification_notes: verificationResult.notes,
      slip_image_hash: imageHash,
      upload_metadata: uploadMetadata,
      initiated_at: new Date().toISOString(),
    };

    let savedPayment;
    if (payment) {
      // Update existing payment
      const { data: updated, error: updateError } = await supabase
        .from("payments")
        .update(paymentData)
        .eq("id", payment.id)
        .select()
        .single();

      if (updateError) {
        console.error("Payment update error:", updateError);
        return res
          .status(500)
          .json({ message: "Failed to update payment record" });
      }
      savedPayment = updated;
    } else {
      // Create new payment
      const { data: created, error: createError } = await supabase
        .from("payments")
        .insert(paymentData)
        .select()
        .single();

      if (createError) {
        console.error("Payment creation error:", createError);
        return res
          .status(500)
          .json({ message: "Failed to create payment record" });
      }
      savedPayment = created;
    }

    // 10. Send notifications based on verification result
    await sendVerificationNotifications(
      buyerId,
      orderId,
      verificationResult.verificationStatus,
      order.total_amount,
    );

    // 11. If auto-approved, update order status
    if (verificationResult.verificationStatus === "AUTO_APPROVED") {
      await supabase
        .from("placed_orders")
        .update({
          status: "PAID_PENDING_DELIVERY",
          payment_status: "AUTHORIZED",
        })
        .eq("id", orderId);
    }

    // 12. Log audit trail
    await logPaymentSlipAudit(
      savedPayment.id,
      "UPLOADED",
      buyerId,
      "buyer",
      {
        notes: `Slip uploaded with ${verificationResult.verificationStatus} status`,
        ocrConfidence: ocrResult.confidence,
        fraudScore: fraudScore.score,
        fraudFlags: fraudScore.flags,
        riskLevel: fraudScore.riskLevel,
      },
      req,
    );

    res.status(200).json({
      message: verificationResult.message,
      paymentId: savedPayment.id,
      verificationStatus: verificationResult.verificationStatus,
      paymentStatus: verificationResult.paymentStatus,
      ocrData: ocrResult,
      slipUrl: publicUrl,
    });
  } catch (error) {
    console.error("Upload payment slip error:", error);
    res.status(500).json({
      message: "Failed to process payment slip",
      error: error.message,
    });
  }
};

/**
 * Get payment slip status
 * Route: GET /api/buyer/payment/slip-status/:orderId
 * Access: Private (Buyer only)
 */
const getPaymentSlipStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const buyerId = req.buyerId; // From getBuyerId middleware

    const { data: payment, error } = await supabase
      .from("payments")
      .select(
        "id, order_id, amount, slip_verification_status, slip_ocr_data, slip_verification_notes, slip_uploaded_at, slip_verified_at, payment_slip_url",
      )
      .eq("order_id", orderId)
      .eq("buyer_id", buyerId)
      .single();

    if (error || !payment) {
      return res.status(404).json({ message: "Payment not found" });
    }

    res.status(200).json({
      orderId: payment.order_id,
      amount: payment.amount,
      verificationStatus: payment.slip_verification_status,
      uploadedAt: payment.slip_uploaded_at,
      verifiedAt: payment.slip_verified_at,
      notes: payment.slip_verification_notes,
      ocrData: payment.slip_ocr_data,
      slipUrl: payment.payment_slip_url,
    });
  } catch (error) {
    console.error("Get slip status error:", error);
    res
      .status(500)
      .json({ message: "Failed to get slip status", error: error.message });
  }
};

module.exports = {
  uploadPaymentSlip,
  getPaymentSlipStatus,
};
