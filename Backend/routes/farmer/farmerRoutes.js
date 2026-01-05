const express = require("express");
const {
  getHomeSummary,
  getForecast,
  getDailyPrices,
  getNotifications,
  markNotificationRead,
  getFeedback,
  createFeedback,
} = require("../controllers/farmerController");

const router = express.Router();

router.get("/home", getHomeSummary);
router.get("/forecast", getForecast);
router.get("/prices/daily", getDailyPrices);
router.get("/notifications", getNotifications);
router.patch("/notifications/:id/read", markNotificationRead);
router.get("/feedback", getFeedback);
router.post("/feedback", createFeedback);

// Moved to routes/farmer/index.js
module.exports = require(".");
