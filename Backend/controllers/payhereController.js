const crypto = require("crypto");
const { supabase } = require("../utils/supabaseClient");

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------
const PAYHERE_BASE_URL = "https://sandbox.payhere.lk"; // switch to live for prod

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

function escHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ---------------------------------------------------------------------------
// POST /api/payhere/preapproval-init
// Auth: buyer JWT (authMiddleware + requireRole("buyer") + getBuyerId applied in router)
// Body: { orderId, deliveryDate? }
// Returns: { url }  — URL to the self-submitting HTML form page
// ---------------------------------------------------------------------------
const preapprovalInit = async (req, res) => {
  try {
    const buyerId = req.buyerId;
    const { orderId, deliveryDate } = req.body;

    if (!orderId) {
      return res.status(400).json({ message: "orderId is required" });
    }

    if (!process.env.PAYHERE_MERCHANT_ID || !process.env.PAYHERE_MERCHANT_SECRET) {
      return res.status(500).json({ message: "PayHere not configured" });
    }

    // Verify order belongs to buyer and is awaiting payment
    const { data: order, error: orderErr } = await supabase
      .from("placed_orders")
      .select("id, buyer_id, status, required_date")
      .eq("id", orderId)
      .eq("buyer_id", buyerId)
      .single();

    if (orderErr || !order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (order.status !== "AWAITING_PAYMENT") {
      return res.status(400).json({
        message: `Order is not awaiting payment (current status: ${order.status})`,
      });
    }

    const chargeDate = deliveryDate || order.required_date;

    const { error: updateErr } = await supabase
      .from("placed_orders")
      .update({
        pay_method: "PAY_LATER",
        preapproval_status: "PENDING",
        auto_charge_date: chargeDate,
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId);

    if (updateErr) {
      console.error("[PayHere] preapproval-init update error:", updateErr.message);
      return res.status(500).json({ message: "Failed to initialise pre-approval" });
    }

    const backendUrl = process.env.BACKEND_URL || "http://localhost:4000";
    const formUrl = `${backendUrl}/payhere/preapproval-form/${orderId}`;

    console.log(`[PayHere] Preapproval initiated for order ${orderId}`);

    return res.status(200).json({ url: formUrl });
  } catch (err) {
    console.error("[PayHere] preapprovalInit error:", err.message);
    return res.status(500).json({ message: "Internal server error", error: err.message });
  }
};

// ---------------------------------------------------------------------------
// GET /payhere/preapproval-form/:orderId
// Public — serves a self-submitting HTML form to PayHere sandbox
// ---------------------------------------------------------------------------
const preapprovalForm = async (req, res) => {
  const { orderId } = req.params;

  const { data: order, error: orderErr } = await supabase
    .from("placed_orders")
    .select("id, buyer_id, fruit_type, variant, quantity, delivery_location, preapproval_status")
    .eq("id", orderId)
    .single();

  if (orderErr || !order) {
    return res.status(404).send("<h2>Order not found.</h2>");
  }

  if (order.preapproval_status === "ACTIVE") {
    return res.status(200).send("<h2>Pre-approval already completed.</h2>");
  }

  const [{ data: userData }, { data: buyerData }] = await Promise.all([
    supabase.from("users").select("first_name, last_name, email, phone").eq("id", order.buyer_id).single(),
    supabase.from("buyers").select("location").eq("user_id", order.buyer_id).single(),
  ]);

  const merchantId = process.env.PAYHERE_MERCHANT_ID;
  const backendUrl = process.env.BACKEND_URL || "http://localhost:4000";

  const amount = "10.00"; // PayHere pre-approval nominal charge
  const currency = "LKR";
  const hash = computeFormHash({ merchantId, orderId, amount, currency });

  const field = (name, value) =>
    `<input type="hidden" name="${name}" value="${escHtml(value)}" />`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Redirecting to PayHere…</title>
  <style>
    body { font-family: sans-serif; display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; background:#f5f5f5; }
    .card { text-align:center; background:#fff; padding:2rem 3rem; border-radius:12px; box-shadow:0 4px 16px rgba(0,0,0,.08); }
    p { color:#555; margin-top:.5rem; }
  </style>
</head>
<body>
  <div class="card">
    <h2>Redirecting to PayHere…</h2>
    <p>Please wait while we redirect you to complete the pre-approval.</p>
    <form id="ph" method="POST" action="${PAYHERE_BASE_URL}/pay/preapprove" referrerpolicy="unsafe-url">
      ${field("merchant_id", merchantId)}
      ${field("return_url", `${backendUrl}/payhere/preapproval-return?orderId=${orderId}&status=success`)}
      ${field("cancel_url", `${backendUrl}/payhere/preapproval-return?orderId=${orderId}&status=cancel`)}
      ${field("notify_url", `${backendUrl}/api/payhere/preapproval-notify`)}
      ${field("first_name", userData?.first_name || "Buyer")}
      ${field("last_name", userData?.last_name || "")}
      ${field("email", userData?.email || "")}
      ${field("phone", userData?.phone || "")}
      ${field("address", buyerData?.location || order.delivery_location || "N/A")}
      ${field("city", "Colombo")}
      ${field("country", "Sri Lanka")}
      ${field("order_id", orderId)}
      ${field("items", `${order.fruit_type || "Fruit"} ${order.variant || ""} x${order.quantity || 1}`)}
      ${field("currency", currency)}
      ${field("amount", amount)}
      ${field("hash", hash)}
    </form>
    <script>document.getElementById("ph").submit();</script>
  </div>
</body>
</html>`;

  return res.status(200).type("text/html").send(html);
};

// ---------------------------------------------------------------------------
// POST /api/payhere/preapproval-notify
// No auth – PayHere server callback
// ---------------------------------------------------------------------------
const preapprovalNotify = async (req, res) => {
  const ok = () => res.status(200).type("text/plain").send("OK");

  const {
    merchant_id,
    order_id,
    payment_id,
    payhere_amount,
    payhere_currency,
    status_code,
    md5sig,
    customer_token,
  } = req.body;

  const merchantSecret = process.env.PAYHERE_MERCHANT_SECRET;
  if (!merchantSecret) {
    console.error("[PayHere] PAYHERE_MERCHANT_SECRET not set");
    return ok();
  }

  const expected = computeNotifySig({
    merchant_id,
    order_id,
    amount: payhere_amount,
    currency: payhere_currency,
    status_code,
  });

  if (expected !== md5sig) {
    console.warn(`[PayHere] preapproval-notify: signature mismatch for order ${order_id}`);
    return ok();
  }

  const code = String(status_code);
  console.log(
    `[PayHere] preapproval-notify — order: ${order_id}, status: ${code}, token: ${customer_token || "none"}`,
  );

  if (code !== "2") return ok();

  if (!customer_token) {
    console.warn(`[PayHere] preapproval-notify: status=2 but no customer_token for order ${order_id}`);
    return ok();
  }

  try {
    const { error } = await supabase
      .from("placed_orders")
      .update({
        preapproval_status: "ACTIVE",
        customer_token,
        updated_at: new Date().toISOString(),
      })
      .eq("id", order_id);

    if (error) {
      console.error(`[PayHere] preapproval update failed for order ${order_id}:`, error.message);
    } else {
      console.log(`[PayHere] Preapproval ACTIVE — order: ${order_id}`);
    }
  } catch (err) {
    console.error("[PayHere] preapprovalNotify unexpected error:", err.message);
  }

  return ok();
};

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
    payhere_amount,
    payhere_currency,
    status_code,
    md5sig,
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

  // 2. Handle by status code
  const code = String(status_code);

  const statusLabels = {
    "2": "success",
    "0": "pending",
    "-1": "cancelled",
    "-2": "failed",
    "-3": "chargedback",
  };

  console.log(
    `[PayHere] Notification received — order: ${order_id}, status: ${code} (${statusLabels[code] || "unknown"}), payment: ${payment_id}`,
  );

  if (code !== "2") {
    // Log non-success statuses but take no DB action
    return ok();
  }

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

    // Guard against duplicate IPN notifications
    if (order.status === "PAID_PENDING_DELIVERY") {
      console.log(`[PayHere] Order ${order_id} already PAID_PENDING_DELIVERY — skipping duplicate`);
      return ok();
    }

    // Update placed_orders status
    const { error: updateErr } = await supabase
      .from("placed_orders")
      .update({
        status: "PAID_PENDING_DELIVERY",
        payment_status: "AUTHORIZED",
        updated_at: new Date().toISOString(),
      })
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

// ---------------------------------------------------------------------------
// GET /payhere/preapproval-return?orderId=&status=success|cancel
// PayHere redirects the browser here after the preapproval flow completes.
// Shows a simple page; mobile app deep-link is embedded so it re-opens the app.
// ---------------------------------------------------------------------------
const preapprovalReturn = (req, res) => {
  const { orderId, status } = req.query;
  const success = status === "success";

  // Redirect to the app deep link — openAuthSessionAsync intercepts this
  // and closes the in-app browser, completing the preapproval flow.
  const deepLink = success
    ? `freshroutemobile://preapproval-success?orderId=${encodeURIComponent(orderId || "")}`
    : `freshroutemobile://preapproval-cancel?orderId=${encodeURIComponent(orderId || "")}`;

  return res.redirect(deepLink);
};

module.exports = { handleNotify, preapprovalInit, preapprovalNotify, preapprovalForm, preapprovalReturn, generateHash };
