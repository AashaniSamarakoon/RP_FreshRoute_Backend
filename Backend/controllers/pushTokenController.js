const { supabaseAdmin, supabase } = require("../utils/supabaseClient");

const db = supabaseAdmin || supabase;

const getTokenFromBody = (body = {}) =>
  body.expoPushToken || body.expo_push_token || body.pushToken || body.token;

const isExpoPushToken = (token) =>
  /^(ExpoPushToken|ExponentPushToken)\[[A-Za-z0-9_-]+\]$/.test(token);

async function savePushToken(req, res) {
  try {
    const userId = req.user?.id;
    const expoPushToken = getTokenFromBody(req.body);

    if (!userId) {
      return res.status(401).json({ message: "Missing authenticated user" });
    }

    if (!expoPushToken || typeof expoPushToken !== "string") {
      return res.status(400).json({ message: "Expo push token is required" });
    }

    if (!isExpoPushToken(expoPushToken)) {
      return res.status(400).json({ message: "Invalid Expo push token" });
    }

    const { data: existing, error: findError } = await db
      .from("user_push_tokens")
      .select("id")
      .eq("user_id", userId)
      .eq("expo_push_token", expoPushToken)
      .maybeSingle();

    if (findError) throw findError;

    if (!existing) {
      const { error: insertError } = await db.from("user_push_tokens").insert({
        user_id: userId,
        expo_push_token: expoPushToken,
      });

      if (insertError) throw insertError;
    }

    return res.status(200).json({
      success: true,
      message: "Push token saved",
    });
  } catch (err) {
    console.error("Save push token error:", err.message);
    return res.status(500).json({
      success: false,
      message: "Failed to save push token",
    });
  }
}

module.exports = { savePushToken };
