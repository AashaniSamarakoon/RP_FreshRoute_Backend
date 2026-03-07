// services/notificationService.js
// Handles real-time notifications for database changes

const { supabase } = require("../utils/supabaseClient");

/**
 * Send notification to farmer
 * Used when notifications aren't auto-triggered by database
 */
async function sendNotification(userId, { title, body, category = "system", severity = "info" }) {
  try {
    const { error } = await supabase
      .from("notifications")
      .insert({
        user_id: userId,
        title,
        body,
        category,
        severity,
      });

    if (error) throw error;

    console.log(`✅ Notification created for user ${userId}: ${title}`);
    return { success: true };
  } catch (err) {
    console.error(`❌ Failed to create notification: ${err.message}`);
    throw err;
  }
}

/**
 * Send bulk notifications to multiple farmers
 */
async function sendBulkNotifications(userIds, { title, body, category, severity }) {
  try {
    const notifications = userIds.map(userId => ({
      user_id: userId,
      title,
      body,
      category,
      severity,
    }));

    const { error } = await supabase
      .from("notifications")
      .insert(notifications);

    if (error) throw error;

    console.log(`✅ Bulk notification sent to ${userIds.length} users`);
    return { success: true, count: userIds.length };
  } catch (err) {
    console.error(`❌ Failed to send bulk notifications: ${err.message}`);
    throw err;
  }
}

/**
 * Send price alert notification when new prices are available
 */
async function notifyPriceUpdate(fruit, price, economicCenter, trend = null) {
  try {
    // Get all farmers
    const { data: farmers, error: farmersErr } = await supabase
      .from("users")
      .select("id")
      .eq("role", "FARMER")
      .eq("sms_alerts_enabled", true);

    if (farmersErr) throw farmersErr;

    const trendEmoji = trend === "up" ? "⬆️" : trend === "down" ? "⬇️" : "➡️";
    
    const body = `${fruit} at ${economicCenter}: Rs. ${price}/kg ${trend ? trendEmoji : ""}`;

    await sendBulkNotifications(
      farmers.map(f => f.id),
      {
        title: `💰 ${fruit} Price Update`,
        body,
        category: "price_alert",
        severity: "info",
      }
    );

    return { success: true };
  } catch (err) {
    console.error(`❌ Failed to notify price update: ${err.message}`);
    throw err;
  }
}

/**
 * Send forecast notification
 */
async function notifyForecast(fruit, forecastValue, date) {
  try {
    // Get all farmers
    const { data: farmers, error: farmersErr } = await supabase
      .from("users")
      .select("id")
      .eq("role", "FARMER")
      .eq("sms_alerts_enabled", true);

    if (farmersErr) throw farmersErr;

    await sendBulkNotifications(
      farmers.map(f => f.id),
      {
        title: `🌱 New ${fruit} Forecast`,
        body: `Expected price: Rs. ${forecastValue}/kg on ${date}`,
        category: "price_alert",
        severity: "info",
      }
    );

    return { success: true };
  } catch (err) {
    console.error(`❌ Failed to notify forecast: ${err.message}`);
    throw err;
  }
}

/**
 * Mark notification as read
 */
async function markAsRead(notificationId, userId) {
  try {
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", notificationId)
      .eq("user_id", userId);

    if (error) throw error;

    console.log(`✅ Notification ${notificationId} marked as read`);
    return { success: true };
  } catch (err) {
    console.error(`❌ Failed to mark as read: ${err.message}`);
    throw err;
  }
}

/**
 * Mark all notifications as read for a user
 */
async function markAllAsRead(userId) {
  try {
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", userId)
      .is("read_at", null);

    if (error) throw error;

    console.log(`✅ All notifications marked as read for user ${userId}`);
    return { success: true };
  } catch (err) {
    console.error(`❌ Failed to mark all as read: ${err.message}`);
    throw err;
  }
}

/**
 * Delete old read notifications (older than 30 days)
 */
async function deleteOldNotifications() {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const { error, count } = await supabase
      .from("notifications")
      .delete()
      .lt("created_at", thirtyDaysAgo)
      .not("read_at", "is", null);

    if (error) throw error;

    console.log(`✅ Deleted ${count} old notifications`);
    return { success: true, deleted: count };
  } catch (err) {
    console.error(`❌ Failed to delete old notifications: ${err.message}`);
    throw err;
  }
}

module.exports = {
  sendNotification,
  sendBulkNotifications,
  notifyPriceUpdate,
  notifyForecast,
  markAsRead,
  markAllAsRead,
  deleteOldNotifications,
};
