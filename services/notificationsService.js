// Notifications Service - handles creating and managing notifications
const { supabase } = require("../supabaseClient");

/**
 * Send price alert notification to farmer
 * @param {string} farmerId - UUID of farmer
 * @param {object} priceData - {fruit_name, current_price, forecast_price, trend}
 */
async function sendPriceAlertNotification(farmerId, priceData) {
  try {
    const trend = priceData.trend === "up" ? "📈" : priceData.trend === "down" ? "📉" : "➡️";
    const title = `${trend} ${priceData.fruit_name} Price Alert`;
    const body = `Current: Rs. ${priceData.current_price}/kg | Forecast: Rs. ${priceData.forecast_price}/kg`;

    const { error } = await supabase.from("notifications").insert({
      user_id: farmerId,
      title,
      body,
      category: "price_alert",
      severity: priceData.trend === "critical" ? "critical" : "info",
      action_url: `/prices/${priceData.fruit_name.toLowerCase()}`,
    });

    if (error) throw error;
    console.log(`✅ Price alert sent to farmer ${farmerId}: ${title}`);
    return true;
  } catch (err) {
    console.error("Price alert error:", err.message);
    return false;
  }
}

/**
 * Send demand update notification
 * @param {string} farmerId - UUID of farmer
 * @param {object} demandData - {fruit_name, demand_level, recommendation}
 */
async function sendDemandUpdateNotification(farmerId, demandData) {
  try {
    const demandEmoji = {
      high: "🚀",
      medium: "📊",
      low: "⬇️",
    };

    const emoji = demandEmoji[demandData.demand_level] || "📊";
    const title = `${emoji} ${demandData.fruit_name} Demand Update`;
    const body = `Demand: ${demandData.demand_level} | Recommendation: ${demandData.recommendation}`;

    const { error } = await supabase.from("notifications").insert({
      user_id: farmerId,
      title,
      body,
      category: "demand_update",
      severity: demandData.demand_level === "high" ? "critical" : "info",
      action_url: `/demand/${demandData.fruit_name.toLowerCase()}`,
    });

    if (error) throw error;
    console.log(`✅ Demand update sent to farmer ${farmerId}: ${title}`);
    return true;
  } catch (err) {
    console.error("Demand update error:", err.message);
    return false;
  }
}

/**
 * Send farming tip notification
 * @param {string} farmerId - UUID of farmer
 * @param {object} tipData - {tip_title, tip_content, fruit_name}
 */
async function sendTipNotification(farmerId, tipData) {
  try {
    const { error } = await supabase.from("notifications").insert({
      user_id: farmerId,
      title: `💡 ${tipData.tip_title}`,
      body: tipData.tip_content,
      category: "tip",
      severity: "info",
      action_url: `/tips/${tipData.fruit_name?.toLowerCase() || "general"}`,
    });

    if (error) throw error;
    console.log(`✅ Tip sent to farmer ${farmerId}: ${tipData.tip_title}`);
    return true;
  } catch (err) {
    console.error("Tip notification error:", err.message);
    return false;
  }
}

/**
 * Send system notification
 * @param {string} farmerId - UUID of farmer
 * @param {object} systemData - {message, severity}
 */
async function sendSystemNotification(farmerId, systemData) {
  try {
    const severityEmoji = {
      info: "ℹ️",
      warning: "⚠️",
      critical: "🚨",
    };

    const emoji = severityEmoji[systemData.severity] || "ℹ️";
    const { error } = await supabase.from("notifications").insert({
      user_id: farmerId,
      title: `${emoji} System Notification`,
      body: systemData.message,
      category: "system",
      severity: systemData.severity || "info",
      action_url: systemData.action_url || null,
    });

    if (error) throw error;
    console.log(`✅ System notification sent to farmer ${farmerId}`);
    return true;
  } catch (err) {
    console.error("System notification error:", err.message);
    return false;
  }
}

/**
 * Send notification to all farmers with specific role
 * @param {string} role - 'farmer', 'transporter', etc.
 * @param {object} notificationData - {title, body, category, severity}
 */
async function sendBroadcastNotification(role, notificationData) {
  try {
    // Get all users with this role
    const { data: users, error: userError } = await supabase
      .from("users")
      .select("id")
      .eq("role", role);

    if (userError) throw userError;
    if (!users || users.length === 0) {
      console.log(`⚠️ No users found with role: ${role}`);
      return 0;
    }

    // Create notifications for all users
    const notifications = users.map((user) => ({
      user_id: user.id,
      title: notificationData.title,
      body: notificationData.body,
      category: notificationData.category,
      severity: notificationData.severity || "info",
      action_url: notificationData.action_url || null,
    }));

    const { error } = await supabase
      .from("notifications")
      .insert(notifications);

    if (error) throw error;
    console.log(`✅ Broadcast sent to ${notifications.length} ${role}s`);
    return notifications.length;
  } catch (err) {
    console.error("Broadcast notification error:", err.message);
    return 0;
  }
}

module.exports = {
  sendPriceAlertNotification,
  sendDemandUpdateNotification,
  sendTipNotification,
  sendSystemNotification,
  sendBroadcastNotification,
};
