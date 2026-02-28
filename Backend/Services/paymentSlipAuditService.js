const { supabase } = require("../utils/supabaseClient");

/**
 * Log payment slip action to audit trail
 */
async function logPaymentSlipAudit(
  paymentId,
  action,
  performedBy,
  role,
  metadata = {},
  req = null,
) {
  try {
    const auditData = {
      payment_id: paymentId,
      action,
      performed_by: performedBy,
      role,
      notes: metadata.notes || null,
      ip_address: req
        ? req.ip ||
          req.headers["x-forwarded-for"] ||
          req.connection.remoteAddress
        : null,
      user_agent: req ? req.headers["user-agent"] : null,
      metadata: metadata,
      created_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("payment_slip_audit_log")
      .insert(auditData);

    if (error) {
      console.error("Audit log error:", error);
    }

    return true;
  } catch (error) {
    console.error("Failed to log audit:", error);
    return false;
  }
}

/**
 * Check if buyer is blocked or high-risk
 */
async function checkBuyerFraudStatus(buyerId) {
  try {
    const { data: fraudScore, error } = await supabase
      .from("buyer_fraud_scores")
      .select("*")
      .eq("buyer_id", buyerId)
      .single();

    // Handle missing table or no data - return safe default
    if (error) {
      if (
        error.code === "PGRST116" ||
        error.code === "PGRST205" ||
        error.code === "42P01"
      ) {
        // PGRST116 = no rows returned
        // PGRST205 = table not found in schema cache
        // 42P01 = table does not exist
        return { isBlocked: false, riskLevel: "LOW" };
      }
      console.error("Fraud check error:", error);
      return { isBlocked: false, riskLevel: "LOW" };
    }

    if (!fraudScore) {
      return { isBlocked: false, riskLevel: "LOW" };
    }

    return {
      isBlocked: fraudScore.is_blocked,
      riskLevel: fraudScore.risk_level,
      rejectionCount: fraudScore.rejection_count,
      lastRejectionAt: fraudScore.last_rejection_at,
      blockReason: fraudScore.block_reason,
    };
  } catch (error) {
    console.error("Fraud status check failed:", error);
    return { isBlocked: false, riskLevel: "LOW" };
  }
}

/**
 * Block a buyer from uploading payment slips
 */
async function blockBuyer(buyerId, blockedBy, reason) {
  try {
    const { data, error } = await supabase
      .from("buyer_fraud_scores")
      .upsert(
        {
          buyer_id: buyerId,
          is_blocked: true,
          blocked_at: new Date().toISOString(),
          blocked_by: blockedBy,
          block_reason: reason,
          risk_level: "BLOCKED",
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "buyer_id",
        },
      )
      .select()
      .single();

    if (error) {
      // Table doesn't exist - silently skip
      if (error.code === "PGRST205" || error.code === "42P01") {
        console.warn(
          "⚠️  buyer_fraud_scores table not found. Skipping fraud tracking.",
        );
        return false;
      }
      console.error("Block buyer error:", error);
      return false;
    }

    // Log the block action
    console.log(
      `[FRAUD] Buyer ${buyerId} blocked by admin ${blockedBy}. Reason: ${reason}`,
    );
    return true;
  } catch (error) {
    console.error("Failed to block buyer:", error);
    return false;
  }
}

/**
 * Unblock a buyer
 */
async function unblockBuyer(buyerId, unblockedBy) {
  try {
    const { error } = await supabase
      .from("buyer_fraud_scores")
      .update({
        is_blocked: false,
        blocked_at: null,
        blocked_by: null,
        block_reason: null,
        risk_level: "LOW",
        updated_at: new Date().toISOString(),
      })
      .eq("buyer_id", buyerId);

    if (error) {
      // Table doesn't exist - silently skip
      if (error.code === "PGRST205" || error.code === "42P01") {
        console.warn(
          "⚠️  buyer_fraud_scores table not found. Skipping fraud tracking.",
        );
        return false;
      }
      console.error("Unblock buyer error:", error);
      return false;
    }

    console.log(`[FRAUD] Buyer ${buyerId} unblocked by admin ${unblockedBy}`);
    return true;
  } catch (error) {
    console.error("Failed to unblock buyer:", error);
    return false;
  }
}

/**
 * Get audit trail for a payment
 */
async function getPaymentAuditTrail(paymentId) {
  try {
    const { data: auditLog, error } = await supabase
      .from("payment_slip_audit_log")
      .select("*")
      .eq("payment_id", paymentId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Get audit trail error:", error);
      return [];
    }

    return auditLog || [];
  } catch (error) {
    console.error("Failed to get audit trail:", error);
    return [];
  }
}

/**
 * Calculate fraud score for uploaded slip
 */
async function calculateFraudScore(buyerId, imageHash, amount, ocrData) {
  let score = 0;
  const flags = [];

  // Check buyer's history
  const fraudStatus = await checkBuyerFraudStatus(buyerId);

  if (fraudStatus.isBlocked) {
    return { score: 100, flags: ["BUYER_BLOCKED"], riskLevel: "BLOCKED" };
  }

  if (fraudStatus.rejectionCount >= 3) {
    score += 40;
    flags.push("MULTIPLE_REJECTIONS");
  }

  // Check for duplicate image hash
  const { data: duplicates } = await supabase
    .from("payments")
    .select("id, buyer_id, order_id")
    .eq("slip_image_hash", imageHash)
    .neq("buyer_id", buyerId)
    .limit(1);

  if (duplicates && duplicates.length > 0) {
    score += 50;
    flags.push("DUPLICATE_IMAGE");
  }

  // Check OCR confidence
  if (ocrData.confidence < 70) {
    score += 20;
    flags.push("LOW_OCR_CONFIDENCE");
  }

  // Check amount extraction
  if (!ocrData.amount || Math.abs(ocrData.amount - amount) / amount > 0.1) {
    score += 30;
    flags.push("AMOUNT_MISMATCH");
  }

  // Check date validity
  if (!ocrData.date) {
    score += 15;
    flags.push("NO_DATE_FOUND");
  }

  // Determine risk level
  let riskLevel = "LOW";
  if (score >= 70) riskLevel = "HIGH";
  else if (score >= 40) riskLevel = "MEDIUM";

  return { score, flags, riskLevel };
}

module.exports = {
  logPaymentSlipAudit,
  checkBuyerFraudStatus,
  blockBuyer,
  unblockBuyer,
  getPaymentAuditTrail,
  calculateFraudScore,
};
