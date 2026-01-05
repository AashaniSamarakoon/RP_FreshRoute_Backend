/**
 * Example: Integration of Notifications with Forecast/Price System
 * 
 * This file shows how to use the notificationsService to send notifications
 * when forecasts are generated or prices change
 */

const { sendPriceAlertNotification, sendDemandUpdateNotification } = require("../../services/notificationsService");
const { supabase } = require("../../supabaseClient");

/**
 * Example 1: Send price alert after generating forecast
 * This would be called when a new forecast is created
 */
async function examplePriceAlertOnForecast(farmerId, forecast) {
  try {
    // Get latest market price for this fruit
    const { data: priceData, error: priceError } = await supabase
      .from("economic_center_prices")
      .select("price_per_unit")
      .eq("fruit_name", forecast.fruit)
      .order("captured_at", { ascending: false })
      .limit(1)
      .single();

    if (priceError) {
      console.warn("Could not fetch price data:", priceError);
      return;
    }

    const currentPrice = priceData?.price_per_unit || 0;
    const forecastPrice = forecast.forecast_value || 0;

    // Determine trend
    let trend = "neutral";
    if (forecastPrice > currentPrice * 1.1) trend = "up";
    if (forecastPrice < currentPrice * 0.9) trend = "down";

    // Send notification
    await sendPriceAlertNotification(farmerId, {
      fruit_name: forecast.fruit,
      current_price: currentPrice,
      forecast_price: forecastPrice,
      trend,
    });
  } catch (err) {
    console.error("Error sending price alert:", err);
  }
}

/**
 * Example 2: Send demand update notification
 * This would be called when demand analysis is performed
 */
async function exampleDemandUpdateNotification(farmerId, fruit, demandAnalysis) {
  try {
    const demandLevel = demandAnalysis.demand_percentage > 70 ? "high" : "medium";
    const recommendation =
      demandLevel === "high"
        ? "High demand! Consider increasing production"
        : "Medium demand. Monitor market conditions";

    await sendDemandUpdateNotification(farmerId, {
      fruit_name: fruit,
      demand_level: demandLevel,
      recommendation,
    });
  } catch (err) {
    console.error("Error sending demand notification:", err);
  }
}

/**
 * Example 3: Send notification when forecast is triggered from mobile app
 * This would be in your forecast generation endpoint
 */
async function triggerForecastWithNotification(req, res) {
  try {
    const farmerId = req.user.id;
    const { fruit_id, fruit_name } = req.body;

    // Generate forecast
    const forecast = await generateForecast(fruit_id, fruit_name);

    // Get accuracy
    const accuracy = await getAccuracyMetrics(fruit_name);

    // Create notification data
    const notificationBody = `
Forecast: Rs. ${forecast.value}/kg
Accuracy: ${accuracy.percentage}%
Market Trend: ${forecast.trend}`.trim();

    // Send notification to farmer
    await sendPriceAlertNotification(farmerId, {
      fruit_name,
      current_price: forecast.current_price,
      forecast_price: forecast.value,
      trend: forecast.trend,
    });

    return res.json({
      success: true,
      forecast,
      accuracy,
      message: "Forecast generated and notification sent",
    });
  } catch (err) {
    console.error("Forecast error:", err);
    return res.status(500).json({ error: err.message });
  }
}

/**
 * Example 4: Broadcast notification to all farmers on price spike
 * This could be a background job or admin trigger
 */
async function broadcastPriceSpikeAlert(fruit_name, spikePercentage) {
  try {
    const { sendBroadcastNotification } = require("../../services/notificationsService");

    const message = `⚠️ Alert: ${fruit_name} price increased by ${spikePercentage.toFixed(1)}%!`;

    await sendBroadcastNotification("farmer", {
      title: `${fruit_name} Price Spike Alert`,
      body: message,
      category: "price_alert",
      severity: spikePercentage > 20 ? "critical" : "warning",
      action_url: `/prices/${fruit_name.toLowerCase()}`,
    });

    console.log(`✅ Price spike notification sent to all farmers`);
  } catch (err) {
    console.error("Broadcast error:", err);
  }
}

module.exports = {
  examplePriceAlertOnForecast,
  exampleDemandUpdateNotification,
  triggerForecastWithNotification,
  broadcastPriceSpikeAlert,
};
