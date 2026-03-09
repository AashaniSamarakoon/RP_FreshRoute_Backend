const crypto = require("crypto");
const { supabaseAdmin: supabase } = require("../utils/supabaseClient");

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------
// PayHere base URL not needed for SDK flows; all interactions are handled by the
// mobile SDK now, so we only keep the hash/notify helpers below.

function computeSecretHash() {
  return crypto
    .createHash("md5")
    .update(process.env.PAYHERE_MERCHANT_SECRET || "")
    .digest("hex")
    .toUpperCase();
}

/**
 * PayHere payment / preapproval form hash (no status_code):
 *   UPPER(md5(merchant_id + order_id + amount + currency + UPPER(md5(secret))))
 */
function computeFormHash({ merchantId, orderId, amount, currency }) {
  return crypto
    .createHash("md5")
    .update(merchantId + orderId + amount + currency + computeSecretHash())
    .digest("hex")
    .toUpperCase();
}

/**
 * PayHere IPN / notify signature (includes status_code):
 *   UPPER(md5(merchant_id + order_id + amount + currency + status_code + UPPER(md5(secret))))
 */
function computeNotifySig({ merchant_id, order_id, amount, currency, status_code }) {
  return crypto
    .createHash("md5")
    .update(
      merchant_id + order_id + amount + currency + status_code + computeSecretHash(),
    )
    .digest("hex")
    .toUpperCase();
}

// ---------------------------------------------------------------------------
// POST /api/payhere/notify
// PayHere IPN (server-to-server) payment notification.
// No auth middleware — PayHere calls this endpoint directly.
//
// md5sig = UPPERCASE( md5( merchant_id + order_id + payhere_amount +
//                          payhere_currency + status_code +
//                          UPPERCASE(md5(merchant_secret)) ) )
// ---------------------------------------------------------------------------
const handleNotify = async (req, res) => {
  // Always respond 200 OK with plain "OK" — PayHere retries on any other response
  const ok = () => res.status(200).type("text/plain").send("OK");

  const {
    merchant_id,
    order_id,
    payment_id,
    authorization_token,
    payhere_amount,
    payhere_currency,
    status_code,
    md5sig,
    customer_token,
  } = req.body;

  if (!process.env.PAYHERE_MERCHANT_SECRET || !process.env.PAYHERE_MERCHANT_ID) {
    console.error("[PayHere] PAYHERE_MERCHANT_SECRET or PAYHERE_MERCHANT_ID environment variable not set");
    return ok();
  }

  // 1. Verify md5 signature
  const localSig = computeNotifySig({
    merchant_id,
    order_id,
    amount: payhere_amount,
    currency: payhere_currency,
    status_code,
  });

  if (localSig !== md5sig) {
    console.warn(`[PayHere] Signature mismatch for order ${order_id} — ignoring`);
    return ok();
  }

  // 2. Handle preapproval notifications (customer_token indicates tokenization)
  if (customer_token) {
    console.log("[PayHere] Preapproval notification received — order:", order_id);
    // record deposit and customer token on order
    try {
      const depositAmount = parseFloat(payhere_amount) || 0;
      const { data: orderRow, error: ordErr } = await supabase
        .from("placed_orders")
        .select("id, buyer_id, status")
        .eq("id", order_id)
        .single();
      if (ordErr || !orderRow) {
        console.error("[PayHere] Preapproval: order not found", ordErr?.message);
        return ok();
      }
      await supabase
        .from("placed_orders")
        .update({
          status: "AUTHORIZED_PAYMENT",
          payment_status: "AUTHORIZED",
          payhere_customer_token: customer_token,
          deposit_paid: depositAmount,
          updated_at: new Date().toISOString(),
        })
        .eq("id", order_id);

      // upsert payments record for deposit
      const { data: existingPayment } = await supabase
        .from("payments")
        .select("id")
        .eq("order_id", order_id)
        .maybeSingle();
      const now = new Date().toISOString();
      if (existingPayment) {
        await supabase
          .from("payments")
          .update({
            amount: depositAmount,
            status: "AUTHORIZED",
            updated_at: now,
            authorized_at: now,
          })
          .eq("id", existingPayment.id);
      } else {
        await supabase.from("payments").insert({
          order_id,
          buyer_id: orderRow.buyer_id,
          amount: depositAmount,
          currency: payhere_currency || "LKR",
          status: "AUTHORIZED",
          payment_method: "payhere",
          authorized_at: now,
          initiated_at: now,
          updated_at: now,
        });
      }
    } catch (e) {
      console.error("[PayHere] Preapproval DB error:", e.message);
    }
    // don't process further as a normal capture
    return ok();
  }

  // 3. Handle by status code
  const code = String(status_code);

  const statusLabels = {
    "2": "success",
    "3": "authorized",       // newer SDK returns 3 for auth-only/capture triggered by driver pickup
    "0": "pending",          // always ignore – shows up when card is held but never captured
    "-1": "cancelled",
    "-2": "failed",
    "-3": "chargedback",
  };

  // log full payload for debugging purposes (especially useful when
  // authorization holds are not behaving as expected)
  console.log("[PayHere] Notification payload:", req.body);
  console.log(
    `[PayHere] Notification received — order: ${order_id}, status: ${code} (${statusLabels[code] || "unknown"}), payment: ${payment_id}`,
  );

  // treat `2` (capture/success) and `3` (auth-only) as actionable; ignore `0`
  // which PayHere spams while an authorization sits in limbo.
  if (code !== "2" && code !== "3") {
    return ok();
  }

  // Notifications with code 3 indicate the card was authorised. We immediately
  // update the order line to AUTHORIZED_PAYMENT and record tokens so the
  // mobile app can continue, even though a subsequent code 2 may arrive later.

  // 3. Payment successful — update placed_orders and payments table
  try {
    const { data: order, error: orderErr } = await supabase
      .from("placed_orders")
      .select("id, buyer_id, status, total_amount")
      .eq("id", order_id)
      .single();

    if (orderErr || !order) {
      console.error(`[PayHere] Order ${order_id} not found:`, orderErr?.message);
      return ok();
    }

    // Guard against duplicate notifications (capture after auth etc.)
    if (order.status === "AUTHORIZED_PAYMENT") {
      console.log(`[PayHere] Order ${order_id} already AUTHORIZED_PAYMENT — skipping duplicate`);
      return ok();
    }

    // Update placed_orders status (store authorization token if present)
    const updateFields = {
      status: "AUTHORIZED_PAYMENT",
      payment_status: "AUTHORIZED",
      updated_at: new Date().toISOString(),
    };
    if (authorization_token) {
      updateFields.payhere_authorization_token = authorization_token;
    }

    const { error: updateErr } = await supabase
      .from("placed_orders")
      .update(updateFields)
      .eq("id", order_id);

    if (updateErr) {
      console.error(`[PayHere] Failed to update placed_orders ${order_id}:`, updateErr.message);
      return ok();
    }

    // Upsert payments record
    const { data: existing } = await supabase
      .from("payments")
      .select("id")
      .eq("order_id", order_id)
      .maybeSingle();

    const now = new Date().toISOString();
    const amount = parseFloat(payhere_amount) || order.total_amount;

    if (existing) {
      await supabase
        .from("payments")
        .update({
          status: "AUTHORIZED",
          payhere_payment_id: payment_id,
          authorization_token: authorization_token || null,
          payment_method: "payhere",
          authorized_at: now,
          updated_at: now,
        })
        .eq("id", existing.id);
    } else {
      await supabase.from("payments").insert({
        order_id,
        buyer_id: order.buyer_id,
        amount,
        currency: payhere_currency || "LKR",
        status: "AUTHORIZED",
        payhere_payment_id: payment_id,
        authorization_token: authorization_token || null,
        payment_method: "payhere",
        authorized_at: now,
        initiated_at: now,
      });
    }

    console.log(`[PayHere] Payment AUTHORIZED — order: ${order_id}, payment: ${payment_id}`);
  } catch (err) {
    console.error("[PayHere] Unexpected error processing notification:", err.message);
  }

  return ok();
};

// ---------------------------------------------------------------------------
// POST /api/payhere/hash
// Auth: buyer JWT — frontend calls this BEFORE startPayment to get the hash
// server-side so merchant_secret never leaves the backend.
//
// Body: { orderId, amount, currency? }
// Returns: { hash, merchantId }
// ---------------------------------------------------------------------------
const generateHash = async (req, res) => {
  const buyerId = req.buyerId;
  const { orderId, amount, currency = "LKR" } = req.body;

  if (!orderId || amount === undefined) {
    return res.status(400).json({ message: "orderId and amount are required" });
  }

  const merchantId = process.env.PAYHERE_MERCHANT_ID;
  const merchantSecret = process.env.PAYHERE_MERCHANT_SECRET;

  if (!merchantId || !merchantSecret) {
    return res.status(500).json({ message: "PayHere not configured" });
  }

  // Confirm the order belongs to this buyer before issuing a hash
  const { data: order, error } = await supabase
    .from("placed_orders")
    .select("id, buyer_id, total_amount")
    .eq("id", orderId)
    .eq("buyer_id", buyerId)
    .single();

  if (error || !order) {
    return res.status(404).json({ message: "Order not found" });
  }

  const formattedAmount = parseFloat(amount).toFixed(2);

  const hash = computeFormHash({ merchantId, orderId, amount: formattedAmount, currency });

  return res.status(200).json({ hash, merchantId, amount: formattedAmount, currency });
};

module.exports = { handleNotify, generateHash };