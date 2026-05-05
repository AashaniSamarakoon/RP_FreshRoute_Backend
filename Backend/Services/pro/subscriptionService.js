const { supabaseAdmin: supabase } = require("../../utils/supabaseClient");

function nowISO() {
  return new Date().toISOString();
}

function parseBool(val) {
  return val === true || val === "true" || val === 1 || val === "1";
}

async function getActiveSubscription(userId) {
  // Return latest ACTIVE subscription that is not expired.
  // If expires_at is null, treat as active (lifetime) but we don't create those by default.
  const { data, error } = await supabase
    .from("user_subscriptions")
    .select("id, user_id, plan, status, started_at, expires_at")
    .eq("user_id", userId)
    .eq("status", "ACTIVE")
    .order("expires_at", { ascending: false, nullsFirst: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    // If table doesn't exist in a fresh environment, fail closed (not pro)
    return { subscription: null, error };
  }

  if (!data) return { subscription: null, error: null };

  if (data.expires_at) {
    const expires = new Date(data.expires_at).getTime();
    if (Number.isFinite(expires) && expires <= Date.now()) {
      return { subscription: null, error: null };
    }
  }

  return { subscription: data, error: null };
}

async function isProUser(userId) {
  const { subscription, error } = await getActiveSubscription(userId);
  if (error) return { isPro: false, subscription: null, error };
  return { isPro: subscription?.plan === "pro", subscription, error: null };
}

async function activateOrExtendPro({ userId, durationDays, providerPaymentId }) {
  const days = Math.min(Math.max(parseInt(durationDays, 10) || 30, 1), 365);

  // Find most recent ACTIVE pro sub (even if close to expiry) to extend from max(now, expires_at)
  const { data: current, error: currentErr } = await supabase
    .from("user_subscriptions")
    .select("id, expires_at")
    .eq("user_id", userId)
    .eq("status", "ACTIVE")
    .eq("plan", "pro")
    .order("expires_at", { ascending: false, nullsFirst: true })
    .limit(1)
    .maybeSingle();

  if (currentErr) throw currentErr;

  const base = current?.expires_at ? new Date(current.expires_at) : new Date();
  const baseMs = Math.max(base.getTime(), Date.now());
  const nextExpires = new Date(baseMs + days * 86400000);

  const now = nowISO();
  // Mark any previous ACTIVE pro subs as EXPIRED if they are past their expires_at (best effort)
  await supabase
    .from("user_subscriptions")
    .update({ status: "EXPIRED", updated_at: now })
    .eq("user_id", userId)
    .eq("plan", "pro")
    .eq("status", "ACTIVE")
    .lt("expires_at", now);

  const { data, error } = await supabase
    .from("user_subscriptions")
    .insert({
      user_id: userId,
      plan: "pro",
      status: "ACTIVE",
      started_at: now,
      expires_at: nextExpires.toISOString(),
      provider: "payhere",
      provider_payment_id: providerPaymentId || null,
      created_at: now,
      updated_at: now,
    })
    .select("id, user_id, plan, status, started_at, expires_at")
    .single();

  if (error) throw error;
  return data;
}

module.exports = {
  parseBool,
  getActiveSubscription,
  isProUser,
  activateOrExtendPro,
};
