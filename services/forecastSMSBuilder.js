// Forecast SMS builder - creates farmer-friendly SMS messages from forecast data
const { supabase } = require("../supabaseClient");

/**
 * Build SMS message from forecast data
 * @param {object} forecast - Single forecast row {fruit, target, date, forecast_value}
 * @param {object} options - {showTrend: bool}
 * @returns {string} Formatted SMS text
 */
function buildForecastSMS(forecast, options = {}) {
  const { showTrend = true } = options;
  const fruit = forecast.fruit || "Produce";
  const target = forecast.target || "unknown";
  const date = forecast.date || "Tomorrow";
  const value = forecast.forecast_value || 0;

  let message = `🌱 FreshRoute Alert\n`;
  message += `Fruit: ${fruit}\n`;
  message += `Date: ${date}\n`;

  if (target === "demand") {
    const demandEmoji = value > 1000 ? "📈" : value < 500 ? "📉" : "➡️";
    message += `${demandEmoji} Predicted Demand: ${Math.round(value)} units\n`;
  } else if (target === "price") {
    const priceEmoji = value > 200 ? "⬆️" : value < 100 ? "⬇️" : "◾";
    message += `${priceEmoji} Expected Price: Rs. ${value.toFixed(2)}/kg\n`;
  }

  message += `\nStay updated with FreshRoute!`;

  return message;
}

/**
 * Get today's forecasts for SMS alert
 * @returns {Promise<Array>} Forecasts for today {fruit, target, date, forecast_value}
 */
async function getFreshForecastsForSMS() {
  try {
    const today = new Date().toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from("forecasts")
      .select("fruit, target, date, forecast_value")
      .eq("date", today)
      .order("fruit", { ascending: true });

    if (error) {
      console.warn("⚠️ Failed to fetch today's forecasts:", error.message);
      return [];
    }

    if (!data || data.length === 0) {
      console.log("ℹ️ No forecasts for today");
      return [];
    }

    return data;
  } catch (err) {
    console.warn("⚠️ Error fetching forecasts:", err.message);
    return [];
  }
}

/**
 * Get farmers with SMS alerts enabled
 * @returns {Promise<Array>} Farmers {id, name, phone, role, sms_alerts_enabled, sms_frequency}
 */
async function getSMSSubscribedFarmers() {
  try {
    const { data, error } = await supabase
      .from("users")
      .select("id, name, phone, role, sms_alerts_enabled, sms_frequency")
      .eq("role", "farmer")
      .eq("sms_alerts_enabled", true)
      .not("phone", "is", null);

    if (error) {
      console.error("Failed to fetch farmers:", error.message);
      return [];
    }

    return data || [];
  } catch (err) {
    console.warn("⚠️ Error fetching SMS farmers:", err.message);
    return [];
  }
}

/**
 * Compile SMS batch: group forecasts by fruit and send to each farmer
 * @param {Array} forecasts - Raw forecast rows {fruit, target, date, forecast_value}
 * @param {Array} farmers - Raw farmer rows {id, name, phone}
 * @returns {Array} {farmer_id, phone, message} objects
 */
function compileSMSBatch(forecasts, farmers) {
  if (!forecasts.length || !farmers.length) {
    console.log("ℹ️ No forecasts or farmers to process");
    return [];
  }

  const batch = [];

  // Group forecasts by fruit
  const forecastsByFruit = {};
  forecasts.forEach(f => {
    if (!forecastsByFruit[f.fruit]) {
      forecastsByFruit[f.fruit] = { demand: null, price: null };
    }
    if (f.target === "demand") forecastsByFruit[f.fruit].demand = f.forecast_value;
    if (f.target === "price") forecastsByFruit[f.fruit].price = f.forecast_value;
  });

  // Create one message per farmer with all fruit forecasts
  farmers.forEach(farmer => {
    let combinedMsg = `📱 FreshRoute Daily Forecast Alert\n`;
    combinedMsg += `Hello ${farmer.name}!\n\n`;

    Object.entries(forecastsByFruit).forEach(([fruit, values], idx) => {
      if (idx > 0) combinedMsg += "\n---\n";
      
      combinedMsg += `🥭 ${fruit}\n`;
      if (values.demand !== null) {
        combinedMsg += `📈 Demand: ${Math.round(values.demand)} units\n`;
      }
      if (values.price !== null) {
        combinedMsg += `💰 Price: Rs. ${values.price.toFixed(2)}/kg\n`;
      }
    });

    combinedMsg += `\n\nCheck FreshRoute app for detailed analysis!`;

    batch.push({
      farmer_id: farmer.id,
      phone: farmer.phone,
      message: combinedMsg,
      forecast_count: forecasts.length,
    });
  });

  return batch;
}

/**
 * Log SMS send attempt to sms_logs table
 */
async function logSMSSend(farmer_id, phone, status, error_msg = null) {
  try {
    const { error } = await supabase
      .from("sms_logs")
      .insert({
        farmer_id,
        phone,
        status,
        error_message: error_msg,
        sent_at: new Date().toISOString(),
        forecast_ids: [], // Empty array for now
      });

    if (error) {
      console.warn("⚠️ Failed to log SMS to database:", error.message);
      return;
    }

    console.log(`📝 SMS log created for farmer ${farmer_id}: ${phone}`);
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
