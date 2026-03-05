const { supabase } = require("../utils/supabaseClient");

const PAYHERE_BASE_URL = "https://sandbox.payhere.lk"; // switch to live URL in production

/**
 * Retrieve an OAuth2 app_token from PayHere using client_credentials flow.
 */
async function getAppToken() {
  const appId = process.env.PAYHERE_APP_ID;
  const appSecret = process.env.PAYHERE_APP_SECRET;

  if (!appId || !appSecret) {
    throw new Error("PAYHERE_APP_ID / PAYHERE_APP_SECRET not set");
  }

  const credentials = Buffer.from(`${appId}:${appSecret}`).toString("base64");

  const response = await fetch(`${PAYHERE_BASE_URL}/merchant/v1/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`PayHere token error (${response.status}): ${text}`);
  }

  const json = await response.json();
  return json.access_token;
}

/**
 * Charge a customer using their stored customer_token.
 * Returns PayHere response JSON: { status: 2 (success) | 0 | -1 | -2, payment_id, ... }
 */
async function chargeCustomer({ appToken, customerToken, orderId, amount, currency, items }) {
  const merchantId = process.env.PAYHERE_MERCHANT_ID;

  const body = new URLSearchParams({
    merchant_id: merchantId,
    app_token: appToken,
    customer_token: customerToken,
    order_id: String(orderId),
    amount: parseFloat(amount).toFixed(2),
    currency: currency || "LKR",
    items,
  });

  const response = await fetch(`${PAYHERE_BASE_URL}/merchant/v1/payment/charge`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  return response.json();
}

/**
 * Look up the live unit price for a fruit from freshroute_prices.
 * Returns null if no record is found.
 */
async function fetchLivePrice(fruitType, variant, grade, date) {
  const { data } = await supabase
    .from("freshroute_prices")
    .select("price")
    .eq("fruit_name", fruitType)
    .eq("variety", variant)
    .eq("grade", grade)
    .eq("target_date", date)
    .maybeSingle();

  return data ? parseFloat(data.price) : null;
}

/**
 * Cron job: auto-charge PAY_LATER orders whose auto_charge_date is today.
 *
 * Queries placed_orders directly for:
 *   pay_method = 'PAY_LATER'
 *   preapproval_status = 'ACTIVE'
 *   auto_charge_date = today
 *   auto_charge_status IS NULL  (not yet attempted)
 *
 * Called by the cron scheduler in index.js.
 */
async function runDailyAutoCharge() {
  console.log("[PayHere Cron] Starting daily auto-charge job…");

  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

  const { data: orders, error: ordersErr } = await supabase
    .from("placed_orders")
    .select("id, buyer_id, total_amount, fruit_type, variant, grade, quantity, customer_token")
    .eq("pay_method", "PAY_LATER")
    .eq("preapproval_status", "ACTIVE")
    .eq("auto_charge_date", today)
    .is("auto_charge_status", null);

  if (ordersErr) {
    console.error("[PayHere Cron] Failed to fetch orders:", ordersErr.message);
    return;
  }

  if (!orders || orders.length === 0) {
    console.log("[PayHere Cron] No PAY_LATER orders due today — nothing to charge.");
    return;
  }

  console.log(`[PayHere Cron] Found ${orders.length} order(s) to auto-charge.`);

  let appToken;
  try {
    appToken = await getAppToken();
  } catch (err) {
    console.error("[PayHere Cron] Cannot obtain app_token, aborting:", err.message);
    return;
  }

  for (const order of orders) {
    const now = new Date().toISOString();
    try {
      if (!order.customer_token) {
        console.warn(`[PayHere Cron] Order ${order.id} — no customer_token, skipping.`);
        continue;
      }

      // Prefer today's live price; fall back to locked total_amount
      let amount = parseFloat(order.total_amount) || 0;
      if (order.fruit_type && order.variant && order.grade) {
        const livePrice = await fetchLivePrice(order.fruit_type, order.variant, order.grade, today);
        if (livePrice && livePrice > 0 && order.quantity) {
          amount = parseFloat((livePrice * order.quantity).toFixed(2));
        }
      }

      if (amount <= 0) {
        console.warn(`[PayHere Cron] Order ${order.id} — could not determine charge amount, skipping.`);
        continue;
      }

      const items = `${order.fruit_type || "Fruit"} ${order.variant || ""} x${order.quantity || 1}`;
      console.log(`[PayHere Cron] Charging order ${order.id} — LKR ${amount.toFixed(2)}`);

      const result = await chargeCustomer({
        appToken,
        customerToken: order.customer_token,
        orderId: order.id,
        amount,
        currency: "LKR",
        items,
      });

      if (result.status === 2) {
        const paymentId = result.payment_id;

        await supabase
          .from("placed_orders")
          .update({
            status: "PAID_PENDING_DELIVERY",
            payment_status: "AUTHORIZED",
            auto_charge_status: "CHARGED",
            updated_at: now,
          })
          .eq("id", order.id);

        // Upsert payments row
        const { data: existing } = await supabase
          .from("payments")
          .select("id")
          .eq("order_id", order.id)
          .maybeSingle();

        if (existing) {
          await supabase
            .from("payments")
            .update({
              status: "AUTHORIZED",
              payhere_payment_id: paymentId,
              payment_method: "payhere_token",
              authorized_at: now,
              updated_at: now,
            })
            .eq("id", existing.id);
        } else {
          await supabase.from("payments").insert({
            order_id: order.id,
            buyer_id: order.buyer_id,
            amount,
            currency: "LKR",
            status: "AUTHORIZED",
            payhere_payment_id: paymentId,
            payment_method: "payhere_token",
            authorized_at: now,
            initiated_at: now,
          });
        }

        console.log(`[PayHere Cron] ✅ Order ${order.id} charged successfully (payment ${paymentId})`);
      } else {
        const errMsg = result.status_message || `PayHere status ${result.status}`;
        console.warn(`[PayHere Cron] ⚠️  Order ${order.id} charge failed — ${errMsg}`);

        await supabase
          .from("placed_orders")
          .update({ auto_charge_status: "FAILED", updated_at: now })
          .eq("id", order.id);

        await supabase.from("payments").upsert(
          {
            order_id: order.id,
            buyer_id: order.buyer_id,
            amount,
            currency: "LKR",
            status: "FAILED",
            payment_method: "payhere_token",
            initiated_at: now,
          },
          { onConflict: "order_id", ignoreDuplicates: false },
        );
      }
    } catch (err) {
      console.error(`[PayHere Cron] Unexpected error for order ${order.id}:`, err.message);
      // Mark as FAILED so it isn't retried in the same day
      await supabase
        .from("placed_orders")
        .update({ auto_charge_status: "FAILED", updated_at: new Date().toISOString() })
        .eq("id", order.id);
    }
  }

  console.log("[PayHere Cron] Daily auto-charge job complete.");
}

module.exports = { runDailyAutoCharge };
