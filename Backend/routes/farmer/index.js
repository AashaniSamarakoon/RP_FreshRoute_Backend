const express = require("express");
const {
  getDashboard,
  getHomeSummary,
  getLiveMarketPrices,
  getDailyPrices,
  getDailyPricesV2,
  getAccuracyInsights,
  // getFruitForecast moved to common controller
  getNotifications,
  markNotificationRead,
  getFeedback,
  createFeedback,
  getHistoricalPrices,
} = require("../../controllers/farmer/farmerController");
const {
  getSMSPreferences,
  updateSMSPreferences,
} = require("../../controllers/farmer/smsController");
const {
  getEstimatedStocks,
} = require("../../controllers/farmer/predictStockController");
const {
  getBatchHistory,
  getVerificationStatus,
} = require("../../controllers/farmer/blockchainController");
const {
  updateOrderStatusPacking,
  updateOrderStatusReady,
  getFarmerOrders,
  getFarmerOrderById,
} = require("../../controllers/farmer/farmerOrderController");
const {
  getNotifications: getNotificationsNew,
  getNotificationById,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  getNotificationStats,
  getNotificationsByCategory,
} = require("../../controllers/farmer/notificationsController");

const router = express.Router();

// Dashboard & Home
router.get("/dashboard", getDashboard);
router.get("/home", getHomeSummary);

// Forecasts – handled by shared router mounted globally

// Market & Prices
router.get("/live-market", getLiveMarketPrices);
router.get("/prices/daily", getDailyPrices);
router.get("/prices/daily-v2", getDailyPricesV2);
router.get("/prices/history", getHistoricalPrices);

// Accuracy
router.get("/accuracy", getAccuracyInsights);

// Notifications (New improved endpoints)
router.get("/notifications", getNotificationsNew);
router.get("/notifications/stats", getNotificationStats);
router.get("/notifications/category/:category", getNotificationsByCategory);
router.get("/notifications/:id", getNotificationById);
router.put("/notifications/:id/read", markAsRead);
router.put("/notifications/read-all", markAllAsRead);
router.delete("/notifications/:id", deleteNotification);

// Legacy notification endpoints (kept for backward compatibility)
router.get("/old-notifications", getNotifications);
router.patch("/old-notifications/:id/read", markNotificationRead);

// Estimated stocks (harvests) for the logged-in farmer
router.get("/estimated-stocks", getEstimatedStocks);

// Blockchain – per-stock history & verification (farmer-scoped)
router.get("/blockchain/history/:stockId", getBatchHistory);
router.get("/blockchain/verify/:stockId", getVerificationStatus);

// Order lifecycle status updates (farmer-side)
// The `packing` step has been removed; the PATCH below now handles both
// AUTHORIZED_PAYMENT (legacy) and PACKING statuses.
router.patch("/orders/:orderId/ready",   updateOrderStatusReady);

// kept for compatibility, forwards to ready
router.patch("/orders/:orderId/packing", updateOrderStatusPacking);

// GET single order by id (farmer must be assigned to it)
router.get("/orders/:orderId", getFarmerOrderById);

// GET orders assigned to this farmer (only after matching)
router.get("/orders", getFarmerOrders);

// Feedback
router.get("/feedback", getFeedback);
router.post("/feedback", createFeedback);

// SMS Preferences
router.get("/sms/preferences", getSMSPreferences);
router.patch("/sms/preferences", updateSMSPreferences);

module.exports = router;
