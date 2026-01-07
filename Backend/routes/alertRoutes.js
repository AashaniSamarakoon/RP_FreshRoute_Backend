/**
 * Alert Trigger Routes
 * Internal endpoints to send notifications/SMS when data updates
 */

const express = require("express");
const router = express.Router();
const {
  alertEconomicCenterPriceUpdate,
  alertForecastUpdate,
  alertFreshRoutePriceUpdate,
} = require("../Services/dataUpdateAlerts");

/**
 * Trigger alert when economic center price is updated
 * Called internally when dambullaScraper updates prices
 * POST /api/alerts/economic-price
 * Body: { fruit_id, fruit_name, min_price, max_price }
 */
router.post("/economic-price", async (req, res) => {
  try {
    const result = await alertEconomicCenterPriceUpdate(req.body);
    res.json(result);
  } catch (err) {
    console.error("[Alert Endpoint] Economic price error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Trigger alert when forecast is updated
 * POST /api/alerts/forecast
 * Body: { fruit_id, fruit_name, predicted_price, forecast_date }
 */
router.post("/forecast", async (req, res) => {
  try {
    const result = await alertForecastUpdate(req.body);
    res.json(result);
  } catch (err) {
    console.error("[Alert Endpoint] Forecast error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Trigger alert when FreshRoute price is updated
 * POST /api/alerts/freshroute-price
 * Body: { fruit_name, grade, price }
 */
router.post("/freshroute-price", async (req, res) => {
  try {
    const result = await alertFreshRoutePriceUpdate(req.body);
    res.json(result);
  } catch (err) {
    console.error("[Alert Endpoint] FreshRoute price error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
