const crypto = require("crypto");
const { supabaseAdmin: supabase } = require("../../utils/supabaseClient");
const {
  isProUser,
  activateOrExtendPro,
} = require("../../Services/pro/subscriptionService");

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function computeSecretHash() {
  return crypto
    .createHash("md5")
    .update(process.env.PAYHERE_MERCHANT_SECRET || "")
    .digest("hex")
    .toUpperCase();
}

function computeNotifySig({ merchant_id, order_id, amount, currency, status_code }) {
  return crypto
    .createHash("md5")
    .update(
      merchant_id + order_id + amount + currency + status_code + computeSecretHash(),
    )
    .digest("hex")
    .toUpperCase();
}

function computeFormHash({ merchantId, orderId, amount, currency }) {
  return crypto
    .createHash("md5")
    .update(merchantId + orderId + amount + currency + computeSecretHash())
    .digest("hex")
    .toUpperCase();
}

function isMissingTableError(err) {
  const msg = String(err?.message || "");
  const code = String(err?.code || "");
  // Postgres undefined_table is 42P01; Supabase may also return a readable message.
  return code === "42P01" || msg.toLowerCase().includes("does not exist");
}

function clampInt(value, min, max, fallback) {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function getPublicBaseUrl(req) {
  const envBase = String(
    process.env.PUBLIC_BASE_URL || process.env.PUBLIC_URL || process.env.BACKEND_URL || "",
  ).trim();
  if (envBase) return envBase.replace(/\/+$/, "");

  const proto = String(req.headers["x-forwarded-proto"] || req.protocol || "http")
    .split(",")[0]
    .trim();
  const host = String(req.headers["x-forwarded-host"] || req.get("host") || "")
    .split(",")[0]
    .trim();
  if (!host) return "";
  return `${proto}://${host}`;
}

function buildProOrderId(userId) {
  // Encode userId into order_id so we don't need a separate "orders" table
  // Format: PRO_<userId>_<uuid>
  return `PRO_${userId}_${crypto.randomUUID()}`;
}

function extractUserIdFromProOrderId(orderId) {
  // Accept only: PRO_<uuid>_<uuid>
  const m = /^PRO_([0-9a-fA-F-]{36})_/.exec(String(orderId || ""));
  return m ? m[1] : null;
}

function parseCrops(primaryCrops) {
  if (!primaryCrops) return [];
  if (Array.isArray(primaryCrops)) return primaryCrops.map(String).filter(Boolean);
  if (typeof primaryCrops === "string") {
    try {
      const json = JSON.parse(primaryCrops);
      if (Array.isArray(json)) return json.map(String).filter(Boolean);
    } catch {
      // try comma-separated
      return primaryCrops
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  return [];
}

function buildLowercaseKeyMap(values) {
  const map = {};
  (values || []).forEach((v) => {
    const key = String(v).trim().toLowerCase();
    if (!key) return;
    if (!map[key]) map[key] = String(v).trim();
  });
  return map;
}

// GET /api/pro/status
async function getProStatus(req, res) {
  const userId = req.user.id;
  const { isPro, subscription, error } = await isProUser(userId);
  if (error) {
    // fail closed
    return res.json({ isPro: false, plan: "free" });
  }
  return res.json({
    isPro,
    plan: isPro ? "pro" : "free",
    subscription: subscription
      ? {
          status: subscription.status,
          startedAt: subscription.started_at,
          expiresAt: subscription.expires_at,
        }
      : null,
  });
}

// POST /api/pro/subscribe/init
// Returns a PayHere payment payload (stateless): order_id encodes the userId.
async function initProSubscription(req, res) {
  const userId = req.user.id;

  const merchantId = process.env.PAYHERE_MERCHANT_ID;
  const merchantSecret = process.env.PAYHERE_MERCHANT_SECRET;
  if (!merchantId || !merchantSecret) {
    return res.status(500).json({ message: "PayHere not configured" });
  }

  const currency = (req.body?.currency || "LKR").toUpperCase();
  const durationDays = clampInt(
    req.body?.durationDays || process.env.PRO_PLAN_DURATION_DAYS,
    1,
    365,
    30,
  );

  const priceLkr = Number(
    req.body?.amount || process.env.PRO_PLAN_PRICE_LKR || "1490",
  );

  if (!Number.isFinite(priceLkr) || priceLkr <= 0) {
    return res.status(400).json({ message: "Invalid amount" });
  }

  const amount = priceLkr.toFixed(2);
  const orderId = buildProOrderId(userId);

  const hash = computeFormHash({ merchantId, orderId, amount, currency });

  // Fetch more complete user details for PayHere payload
  const { data: userRow } = await supabase
    .from("users")
    .select("first_name,last_name,email,phone")
    .eq("id", userId)
    .maybeSingle();

  // Optional: farmer location as an address/city hint
  const { data: farmerRow } = await supabase
    .from("farmers")
    .select("location")
    .eq("user_id", userId)
    .maybeSingle();

  const firstName =
    String(req.user.first_name || userRow?.first_name || req.body?.first_name || "").trim();
  const lastName =
    String(req.user.last_name || userRow?.last_name || req.body?.last_name || "").trim();
  const email = String(req.user.email || userRow?.email || req.body?.email || "").trim();
  const phone = String(req.user.phone || userRow?.phone || req.body?.phone || "").trim();

  // PayHere typically requires these identity fields.
  if (!firstName || !lastName || !email || !phone) {
    return res.status(400).json({
      message: "Missing required customer fields for payment",
      required: ["first_name", "last_name", "email", "phone"],
    });
  }

  const locationHint = String(farmerRow?.location || "").trim();
  const address = String(req.body?.address || locationHint || "Sri Lanka").trim();
  const city = String(req.body?.city || locationHint || "Colombo").trim();
  const country = String(req.body?.country || "Sri Lanka").trim();

  const baseUrl = getPublicBaseUrl(req);
  const notifyUrl = baseUrl ? `${baseUrl}/api/pro/payhere/notify` : "/api/pro/payhere/notify";

  const items = String(req.body?.items || "FreshRoute Pro Plan").trim();

  // OPTIONAL audit insert (ignore if table not present)
  try {
    const now = new Date().toISOString();
    const { error: auditErr } = await supabase
      .from("pro_subscription_orders")
      .insert({
        id: orderId,
        user_id: userId,
        amount,
        currency,
        status: "PENDING",
        provider: "payhere",
        created_at: now,
        updated_at: now,
      });
    if (auditErr && !isMissingTableError(auditErr)) {
      console.warn("[Pro] Audit insert failed:", auditErr.message);
    }
  } catch (e) {
    if (!isMissingTableError(e)) {
      console.warn("[Pro] Audit insert exception:", e.message);
    }
  }

  // Return the PayHere payment object directly (snake_case) as expected by the app.
  return res.status(200).json({
    merchant_id: merchantId,
    order_id: orderId,
    items,
    amount,
    currency,
    hash,
    notify_url: notifyUrl,
    first_name: firstName,
    last_name: lastName,
    email,
    phone,
    address,
    city,
    country,
    // Extra meta for the app (safe to ignore if it passes object to PayHere SDK)
    _meta: { plan: "pro", durationDays },
  });
}

// POST /api/pro/payhere/notify
// PayHere IPN for Pro plan purchase (separate from normal order payments)
const handleProNotify = async (req, res) => {
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
    console.error(
      "[Pro PayHere] PAYHERE_MERCHANT_SECRET or PAYHERE_MERCHANT_ID not set",
    );
    return ok();
  }

  // Verify md5 signature
  const localSig = computeNotifySig({
    merchant_id,
    order_id,
    amount: payhere_amount,
    currency: payhere_currency,
    status_code,
  });

  if (localSig !== md5sig) {
    console.warn(`[Pro PayHere] Signature mismatch for order ${order_id}`);
    return ok();
  }

  const code = String(status_code);
  if (code !== "2" && code !== "3") {
    // ignore pending/cancelled/failed
    return ok();
  }

  try {
    const userId = extractUserIdFromProOrderId(order_id);
    if (!userId) {
      console.error("[Pro PayHere] Invalid pro order_id format:", order_id);
      return ok();
    }

    // OPTIONAL audit update (ignore if table not present)
    try {
      const now = new Date().toISOString();
      const { error: auditErr } = await supabase
        .from("pro_subscription_orders")
        .update({
          status: "PAID",
          provider_payment_id: payment_id || null,
          updated_at: now,
        })
        .eq("id", order_id);
      if (auditErr && !isMissingTableError(auditErr)) {
        console.warn("[Pro] Audit update failed:", auditErr.message);
      }
    } catch (e) {
      if (!isMissingTableError(e)) {
        console.warn("[Pro] Audit update exception:", e.message);
      }
    }

    const durationDays = clampInt(process.env.PRO_PLAN_DURATION_DAYS, 1, 365, 30);
    await activateOrExtendPro({
      userId,
      durationDays,
      providerPaymentId: payment_id,
    });

    console.log(`[Pro PayHere] Pro activated for user ${userId}`);
  } catch (e) {
    console.error("[Pro PayHere] notify error", e.message);
  }

  return ok();
};

// GET /api/pro/personal-market-forecast
async function getPersonalMarketForecast(req, res) {
  try {
    const userId = req.user.id;
    const days = clampInt(req.query?.days, 7, 30, 14);
    const target = String(req.query?.target || "price").toLowerCase();

    // Farmer profile includes primary_crops and location
    const { data: farmer, error: farmerErr } = await supabase
      .from("farmers")
      .select("primary_crops, location")
      .eq("user_id", userId)
      .single();

    if (farmerErr || !farmer) {
      return res.status(404).json({ message: "Farmer profile not found" });
    }

    const crops = parseCrops(farmer.primary_crops);
    if (!crops.length) {
      return res.status(400).json({ message: "No crops found for user" });
    }

    const cropKeyMap = buildLowercaseKeyMap(crops);
    const cropKeys = Object.keys(cropKeyMap);
    const canonicalCrops = cropKeys.map((k) => cropKeyMap[k]);

    const today = todayISO();
    const end = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

    // Forecast series for user's crops
    const fruitOr = cropKeys
      .map((k) => {
        const safe = k.replace(/,/g, "");
        return `fruit.ilike.%${safe}%`;
      })
      .join(",");

    const { data: forecastRows, error: fErr } = await supabase
      .from("forecasts")
      .select("fruit, target, date, forecast_value")
      .or(fruitOr)
      .eq("target", target)
      .gte("date", today)
      .lte("date", end)
      .order("date", { ascending: true });

    // If price forecasts missing, fall back to demand.
    let rows = forecastRows;
    if ((!rows || rows.length === 0) && target !== "demand") {
      const alt = await supabase
        .from("forecasts")
        .select("fruit, target, date, forecast_value")
        .or(fruitOr)
        .eq("target", "demand")
        .gte("date", today)
        .lte("date", end)
        .order("date", { ascending: true });
      if (!alt.error) rows = alt.data;
    }

    if (fErr) {
      console.warn("Personal forecast query error", fErr.message);
    }

    // Live market prices for today, optionally filtered by farmer location
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    let priceQuery = supabase
      .from("economic_center_prices")
      .select("fruit_name, min_price, max_price, unit, captured_at, economic_center")
      .gte("captured_at", `${today}T00:00:00Z`)
      .lt("captured_at", `${tomorrow}T00:00:00Z`)
      .order("captured_at", { ascending: false })
      .limit(500);

    const location = String(req.query?.location || farmer.location || "").trim();
    if (location) {
      priceQuery = priceQuery.ilike("economic_center", `%${location}%`);
    }

    const { data: liveRows } = await priceQuery;

    const liveByFruit = {};
    (liveRows || [])
      .filter((r) => cropKeyMap[String(r.fruit_name || "").toLowerCase()])
      .forEach((r) => {
        const canonical = cropKeyMap[String(r.fruit_name || "").toLowerCase()];
        const min = r.min_price == null ? null : Number(r.min_price);
        const max = r.max_price == null ? null : Number(r.max_price);
        const avg =
          min != null && max != null && Number.isFinite(min) && Number.isFinite(max)
            ? (min + max) / 2
            : null;
        if (!liveByFruit[canonical]) {
          liveByFruit[canonical] = { values: [], unit: r.unit || "kg" };
        }
        if (avg != null) liveByFruit[canonical].values.push(avg);
      });

    const liveAvg = Object.fromEntries(
      canonicalCrops.map((fruit) => {
        const vals = liveByFruit[fruit]?.values || [];
        const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
        return [fruit, avg != null ? Number(avg.toFixed(2)) : null];
      }),
    );

    // Build chart-ready series
    const byFruit = Object.fromEntries(canonicalCrops.map((c) => [c, []]));
    (rows || []).forEach((r) => {
      const canonical = cropKeyMap[String(r.fruit || "").toLowerCase()];
      if (!canonical || !byFruit[canonical]) return;
      const val = typeof r.forecast_value === "number" ? r.forecast_value : Number(r.forecast_value);
      byFruit[canonical].push({
        date: r.date,
        forecast: Number.isFinite(val) ? Number(val.toFixed(2)) : null,
      });
    });

    const series = canonicalCrops.map((fruit) => {
      const points = (byFruit[fruit] || []).map((p, idx, arr) => {
        const prev = idx > 0 ? arr[idx - 1].forecast : null;
        const trend =
          prev != null && p.forecast != null
            ? p.forecast > prev
              ? "up"
              : p.forecast < prev
                ? "down"
                : "stable"
            : "stable";

        const liveToday = liveAvg[fruit];
        const combined =
          liveToday != null && p.forecast != null
            ? Number((0.7 * p.forecast + 0.3 * liveToday).toFixed(2))
            : p.forecast;

        return {
          date: p.date,
          forecast: p.forecast,
          liveToday,
          combined,
          trend,
        };
      });

      return {
        fruit,
        unit: target === "price" ? "LKR" : "units",
        liveToday: liveAvg[fruit],
        points,
      };
    });

    // Generate simple hints
    const hints = series.flatMap((s) => {
      const pts = s.points.filter((p) => p.forecast != null);
      if (!pts.length) return [{ fruit: s.fruit, level: "info", text: "No forecast data available yet." }];

      const first = pts[0].forecast;
      const last = pts[pts.length - 1].forecast;
      const deltaPct = first ? ((last - first) / first) * 100 : 0;

      const hintBase = (level, text) => ({ fruit: s.fruit, level, text });

      if (deltaPct >= 10) {
        return [
          hintBase(
            "positive",
            `Forecast shows ~${deltaPct.toFixed(1)}% increase over next ${pts.length} days. Consider delaying sales if storage/quality allows.`,
          ),
        ];
      }
      if (deltaPct <= -10) {
        return [
          hintBase(
            "warning",
            `Forecast shows ~${Math.abs(deltaPct).toFixed(1)}% drop over next ${pts.length} days. Consider selling earlier or locking a buyer price.`,
          ),
        ];
      }

      return [hintBase("info", "Prices look relatively stable. Plan harvest and logistics normally.")];
    });

    return res.json({
      userId,
      location: location || null,
      crops: canonicalCrops,
      range: { from: today, to: end, days },
      target,
      series,
      hints,
      meta: {
        chart: {
          suggestedType: "line",
          xKey: "date",
          yKeys: ["forecast", "combined"],
        },
        sources: {
          forecastsTable: "forecasts",
          livePricesTable: "economic_center_prices",
        },
      },
    });
  } catch (err) {
    console.error("Personal market forecast error", err);
    return res.status(500).json({ message: "Failed to build personal forecast" });
  }
}

module.exports = {
  getProStatus,
  initProSubscription,
  handleProNotify,
  getPersonalMarketForecast,
};
