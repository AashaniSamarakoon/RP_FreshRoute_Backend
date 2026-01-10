const express = require("express");
const {
  getDashboard,
  getHomeSummary,
  getForecast,
  getForecast7Day,
  getLiveMarketPrices,
  getDailyPrices,
  getDailyPricesV2,
  getAccuracyInsights,
  getFruitForecast,
  getNotifications,
  markNotificationRead,
  getFeedback,
  createFeedback,
  getHistoricalPrices,
} = require("../../controllers/farmer/farmerController");
const { getFreshRoutePrices } = require("../../routes/farmer/freshRoutePricesEndpoint");
const { getSMSPreferences, updateSMSPreferences } = require("../../controllers/farmer/smsController");
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

// Forecasts
router.get("/forecast", getForecast);
router.get("/forecast/7day", getForecast7Day);
router.get("/forecast/fruit", getFruitForecast);

// Market & Prices
router.get("/live-market", getLiveMarketPrices);
router.get("/prices/daily", getDailyPrices);
router.get("/prices/daily-v2", getDailyPricesV2);
router.get("/prices/history", getHistoricalPrices);
router.get("/prices/freshroute", getFreshRoutePrices);


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

// Feedback
router.get("/feedback", getFeedback);
router.post("/feedback", createFeedback);

// SMS Preferences
router.get("/sms/preferences", getSMSPreferences);
router.patch("/sms/preferences", updateSMSPreferences);

module.exports = router;
