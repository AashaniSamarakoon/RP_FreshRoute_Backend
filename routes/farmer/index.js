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
const { getSMSPreferences, updateSMSPreferences } = require("../../controllers/farmer/smsController");

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


// Accuracy
router.get("/accuracy", getAccuracyInsights);

// Notifications & Feedback
router.get("/notifications", getNotifications);
router.patch("/notifications/:id/read", markNotificationRead);
router.get("/feedback", getFeedback);
router.post("/feedback", createFeedback);

// SMS Preferences
router.get("/sms/preferences", getSMSPreferences);
router.patch("/sms/preferences", updateSMSPreferences);

module.exports = router;
