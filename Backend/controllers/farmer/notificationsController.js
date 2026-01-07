// Notifications Controller - API endpoints for frontend
const { supabase } = require("../../utils/supabaseClient");

/**
 * GET /api/farmer/notifications
 * Get all notifications for logged-in farmer
 * Query params: limit=20, offset=0, read=false (optional)
 */
async function getNotifications(req, res) {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;
    const read = req.query.read ? req.query.read === "true" : null;

    let query = supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (read !== null) {
      query = read
        ? query.not("read_at", "is", null)
        : query.is("read_at", null);
    }

    const { data, error } = await query;

    if (error) throw error;

    // Get unread count
    const { count: unreadCount, error: countError } = await supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .is("read_at", null);

    if (countError) throw countError;

    return res.json({
      notifications: data || [],
      unreadCount: unreadCount || 0,
      total: (data && data.length) || 0,
    });
  } catch (err) {
    console.error("Get notifications error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}

/**
 * GET /api/farmer/notifications/:id
 * Get single notification details
 */
async function getNotificationById(req, res) {
  try {
    const userId = req.user.id;
    const id = req.params.id || req.params.notificationId;

    if (!id) {
      return res.status(400).json({ error: "Notification id is required" });
    }

    if (!id) {
      return res.status(400).json({ error: "Notification id is required" });
    }

    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("id", id)
      .eq("user_id", userId)
      .single();

    if (error) throw error;
    if (!data) {
      return res.status(404).json({ error: "Notification not found" });
    }

    return res.json({ success: true, data });
  } catch (err) {
    console.error("Get notification error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}

/**
 * PUT /api/farmer/notifications/:id/read
 * Mark notification as read
 */
async function markAsRead(req, res) {
  try {
    const userId = req.user.id;
    const id = req.params.id || req.params.notificationId;

    if (!id) {
      return res.status(400).json({ error: "Notification id is required" });
    }

    if (!id) {
      return res.status(400).json({ error: "Notification id is required" });
    }

    // Verify notification belongs to user
    const { data: notification, error: fetchError } = await supabase
      .from("notifications")
      .select("id")
      .eq("id", id)
      .eq("user_id", userId)
      .single();

    if (fetchError || !notification) {
      return res.status(404).json({ error: "Notification not found" });
    }

    // Mark as read
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id);

    if (error) throw error;

    return res.json({ success: true, message: "Marked as read" });
  } catch (err) {
    console.error("Mark as read error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}

/**
 * PUT /api/farmer/notifications/read-all
 * Mark all notifications as read
 */
async function markAllAsRead(req, res) {
  try {
    const userId = req.user.id;

    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", userId)
      .is("read_at", null);

    if (error) throw error;

    return res.json({ success: true, message: "All notifications marked as read" });
  } catch (err) {
    console.error("Mark all as read error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}

/**
 * DELETE /api/farmer/notifications/:id
 * Delete a notification
 */
async function deleteNotification(req, res) {
  try {
    const userId = req.user.id;
    const id = req.params.id || req.params.notificationId;

    if (!id) {
      return res.status(400).json({ error: "Notification id is required" });
    }

    // Verify notification belongs to user
    const { data: notification, error: fetchError } = await supabase
      .from("notifications")
      .select("id")
      .eq("id", id)
      .eq("user_id", userId)
      .single();

    if (fetchError || !notification) {
      return res.status(404).json({ error: "Notification not found" });
    }

    // Delete notification
    const { error } = await supabase
      .from("notifications")
      .delete()
      .eq("id", id);

    if (error) throw error;

    return res.json({ success: true, message: "Notification deleted" });
  } catch (err) {
    console.error("Delete notification error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}

/**
 * GET /api/farmer/notifications/stats
 * Get notification statistics
 */
async function getNotificationStats(req, res) {
  try {
    const userId = req.user.id;

    const { data: all, error: allError } = await supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId);

    const { data: unread, error: unreadError } = await supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .is("read_at", null);

    const { data: byCategory, error: categoryError } = await supabase
      .from("notifications")
      .select("category")
      .eq("user_id", userId);

    if (allError || unreadError || categoryError) throw new Error("Database error");

    // Count by category
    const categoryCount = {};
    (byCategory || []).forEach((n) => {
      categoryCount[n.category] = (categoryCount[n.category] || 0) + 1;
    });

    return res.json({
      success: true,
      stats: {
        total: all.length || 0,
        unread: unread.length || 0,
        byCategory: categoryCount,
      },
    });
  } catch (err) {
    console.error("Get stats error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}

/**
 * GET /api/farmer/notifications/category/:category
 * Get notifications by category
 */
async function getNotificationsByCategory(req, res) {
  try {
    const userId = req.user.id;
    let { category } = req.params;
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;

    // Map short category names to database values
    const categoryMap = {
      "price": "price_alert",
      "demand": "demand_update",
      "tip": "tip",
      "system": "system",
      "app": "system",
      "price_alert": "price_alert",
      "demand_update": "demand_update"
    };

    const mappedCategory = categoryMap[category];
    if (!mappedCategory) {
      return res.status(400).json({ error: "Invalid category" });
    }

    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .eq("category", mappedCategory)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    return res.json({ notifications: data || [], total: (data && data.length) || 0 });
  } catch (err) {
    console.error("Get by category error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}

module.exports = {
  getNotifications,
  getNotificationById,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  getNotificationStats,
  getNotificationsByCategory,
};
