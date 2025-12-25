// Forecast SMS builder - creates farmer-friendly SMS messages from forecast data
const { supabase } = require("../supabaseClient");

/**
 * Build SMS message from forecast data
 * @param {object} forecast - Single forecast row with fruit and market relations
 * @param {object} options - {showPrice: bool, showDemand: bool}
 * @returns {string} Formatted SMS text
 */
function buildForecastSMS(forecast, options = {}) {
  const { showPrice = true, showDemand = true } = options;
  const fruit = forecast.fruits?.name || "Produce";
  const market = forecast.markets?.name || "Market";
  const date = forecast.target_date || "Tomorrow";

  let message = `🌱 FreshRoute Alert - ${fruit}\n`;
  message += `Market: ${market} | Date: ${date}\n`;

  if (showDemand) {
    const demandEmoji = forecast.demand_trend === "Rising Demand" ? "📈" : forecast.demand_trend === "Declining Demand" ? "📉" : "➡️";
    message += `${demandEmoji} Demand: ${forecast.demand_trend || "Stable"} (${forecast.predicted_demand || "N/A"} units)\n`;
  }

  if (showPrice) {
    const priceEmoji = forecast.price_trend === "Price Increase" ? "⬆️" : forecast.price_trend === "Price Decrease" ? "⬇️" : "◾";
    message += `${priceEmoji} Expected Price: Rs. ${forecast.predicted_price?.toFixed(2) || "N/A"}/kg\n`;
  }

  message += `Confidence: ${((forecast.confidence || 0) * 100).toFixed(0)}%`;

  return message;
}

/**
 * Get fresh forecasts (generated today) for SMS batch send
 * @param {number} hoursOld - Only include forecasts generated in last N hours (default 12)
 * @returns {Promise<Array>} Forecasts with fruit and market data
 */
async function getFreshForecastsForSMS(hoursOld = 12) {
  try {
    const cutoffTime = new Date(Date.now() - hoursOld * 3600000).toISOString();

    const { data, error } = await supabase
      .from("forecast_daily")
      .select(
        `
        id,
        fruit_id,
        market_id,
        target_date,
        predicted_price,
        predicted_demand,
        demand_trend,
        price_trend,
        confidence,
        generated_at,
        fruits(name, variety),
        markets(name, district)
      `
      )
      .gte("generated_at", cutoffTime)
      .order("generated_at", { ascending: false });

    if (error) {
      console.warn("⚠️ Failed to fetch forecasts:", error.message);
      return [];
    }

    return data || [];
  } catch (err) {
    console.warn("⚠️ Error fetching forecasts:", err.message);
    return [];
  }
}

/**
 * Get farmers subscribed to SMS alerts with their phone numbers
 * @returns {Promise<Array>} Farmers {id, name, email, phone, preferred_market_id}
 */
async function getSMSSubscribedFarmers() {
  try {
    // Try to get farmers with SMS enabled (requires schema migration)
    const { data, error } = await supabase
      .from("users")
      .select("id, name, email, phone")
      .eq("role", "farmer")
      .eq("sms_alerts_enabled", true)
      .not("phone", "is", null);

    if (error) {
      // If column doesn't exist, return empty array with helpful message
      if (error.message.includes("sms_alerts_enabled") || error.code === "PGRST116") {
        console.warn("⚠️ sms_alerts_enabled column not found - please run schema migration");
        return [];
      }
      console.error("Failed to fetch farmers:", error.message);
      throw error;
    }

    return data || [];
  } catch (err) {
    console.warn("⚠️ Error fetching SMS farmers:", err.message);
    return [];
  }
}

/**
 * Compile SMS batch: map forecasts to farmers + create message text
 * @param {Array} forecasts - Raw forecast rows
 * @param {Array} farmers - Raw farmer rows
 * @returns {Array} {phone, message} objects
 */
function compileSMSBatch(forecasts, farmers) {
  if (!forecasts.length || !farmers.length) {
    return [];
  }

  const batch = [];
  const topForecasts = forecasts.slice(0, 3); // Send top 3 forecasts per farmer

  farmers.forEach((farmer) => {
    const messages = topForecasts.map((f) => buildForecastSMS(f));
    const combinedMsg = messages.join("\n---\n");

    batch.push({
      farmer_id: farmer.id,
      phone: farmer.phone,
      message: combinedMsg,
      forecast_ids: topForecasts.map((f) => f.id),
    });
  });

  return batch;
}

/**
 * Log SMS send attempt in DB for audit trail
 * @param {string} farmer_id
 * @param {Array} forecast_ids
 * @param {string} phone
 * @param {string} status - 'pending', 'sent', 'failed'
 * @param {string} error_msg - Optional error message
 */
async function logSMSSend(farmer_id, forecast_ids, phone, status, error_msg = null) {
  try {
    const { error } = await supabase.from("sms_logs").insert({
      farmer_id,
      forecast_ids,
      phone,
      status,
      error_message: error_msg,
      sent_at: new Date().toISOString(),
    });

    if (error) {
      console.warn("⚠️ Failed to log SMS (table may not exist):", error.message);
    }
  } catch (err) {
    console.warn("⚠️ SMS logging error:", err.message);
  }
}

module.exports = {
  buildForecastSMS,
  getFreshForecastsForSMS,
  getSMSSubscribedFarmers,
  compileSMSBatch,
  logSMSSend,
};
