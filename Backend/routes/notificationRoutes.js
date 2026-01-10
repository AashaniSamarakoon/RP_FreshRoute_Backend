// routes/notifications.js
// Notification API endpoints

const express = require("express");
const router = express.Router();
const { authMiddleware, requireRole } = require("../auth");
const {
  getNotifications,
  getNotificationById,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  getNotificationStats,
  getNotificationsByCategory,
} = require("../controllers/farmer/notificationsController");

// All routes require auth and farmer role
router.use(authMiddleware);
router.use(requireRole("farmer"));

/**
 * GET /api/notifications
 * Get all notifications for logged-in farmer
 * Query params: 
 *   - limit: number (default 20)
 *   - offset: number (default 0)
 *   - read: 'true'|'false' (optional, filter by read status)
 */
router.get("/", getNotifications);

/**
 * GET /api/notifications/stats
 * Get notification statistics
 * Response: { total, unread, byCategory }
 */
router.get("/stats", getNotificationStats);

/**
 * GET /api/notifications/category/:category
 * Get notifications by category
 * Categories: price_alert, demand_update, tip, system
 */
router.get("/category/:category", getNotificationsByCategory);

/**
 * GET /api/notifications/:notificationId
 * Get a single notification
 */
router.get("/:notificationId", getNotificationById);

/**
 * PUT /api/notifications/:notificationId/read
 * Mark a notification as read
 */
router.put("/:notificationId/read", markAsRead);

/**
 * PUT /api/notifications/read-all
 * Mark all unread notifications as read
 */
router.put("/read-all", markAllAsRead);

/**
 * DELETE /api/notifications/:notificationId
 * Delete a notification
 */
router.delete("/:notificationId", deleteNotification);

module.exports = router;
