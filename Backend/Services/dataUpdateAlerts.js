/**
 * Data Update Alerts Service
 * Sends notifications and SMS when forecast or economic_center_prices are updated
 * Uses existing notifications table and SMS service
 */

const { supabase } = require("../utils/supabaseClient");
const {
  sendPriceAlertNotification,
  sendDemandUpdateNotification,
} = require("./notificationsService");
const { sendBatchSMS } = require("./farmer/smsService");

/**
 * Send notification and SMS to farmers about economic center price updates
 * @param {object} priceData - Updated price data {fruit_id, fruit_name, min_price, max_price}
 */
async function alertEconomicCenterPriceUpdate(priceData) {
  try {
    const { fruit_id, fruit_name, min_price, max_price } = priceData;
    
    console.log(`[Price Alert] Economic center price updated: ${fruit_name} - Rs. ${min_price}-${max_price}`);

    // Get all farmers
    const { data: farmers, error: farmersErr } = await supabase
      .from("users")
      .select("id, phone")
      .eq("role", "farmer")
      .eq("sms_alerts_enabled", true);

    if (farmersErr) {
      console.warn("[Price Alert] Error fetching farmers:", farmersErr.message);
      return { success: false, error: farmersErr.message };
    }

    if (!farmers || farmers.length === 0) {
      console.log("[Price Alert] No farmers with SMS alerts enabled");
      return { success: true, message: "No farmers to notify" };
    }

    let notificationCount = 0;
    const avgPrice = Math.round((min_price + max_price) / 2);

    // Send notification to each farmer using existing service
    for (const farmer of farmers) {
      try {
        await sendPriceAlertNotification(farmer.id, {
          fruit_name,
          current_price: avgPrice,
          forecast_price: max_price,
          trend: "info",
        });
        notificationCount++;
      } catch (notifErr) {
        console.warn(`[Price Alert] Failed to notify farmer ${farmer.id}:`, notifErr.message);
      }
    }

    console.log(`[Price Alert] ✅ Notifications sent to ${notificationCount} farmers`);

    // Send SMS if phone numbers available
    const phoneNumbers = farmers.map(f => f.phone).filter(p => p);
    if (phoneNumbers.length > 0) {
      try {
        const smsMessage = `FreshRoute: ${fruit_name} price updated to Rs. ${min_price}-${max_price}/kg at Dambulla market.`;
        const smsBatch = phoneNumbers.map(phone => ({ phone, message: smsMessage }));
        await sendBatchSMS(smsBatch);
        console.log(`[Price Alert] ✅ SMS sent to ${phoneNumbers.length} farmers`);
      } catch (smsErr) {
        console.warn("[Price Alert] SMS sending failed:", smsErr.message);
      }
    }

    return {
      success: true,
      notificationsSent: notificationCount,
      smsSent: phoneNumbers.length,
    };
  } catch (err) {
    console.error("[Price Alert] Error:", err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Send notification and SMS to farmers about forecast updates
 * @param {object} forecastData - Updated forecast data {fruit_id, fruit_name, predicted_price, forecast_date}
 */
async function alertForecastUpdate(forecastData) {
  try {
    const { fruit_id, fruit_name, predicted_price, forecast_date } = forecastData;
    
    console.log(`[Forecast Alert] Forecast updated: ${fruit_name} - Rs. ${predicted_price} on ${forecast_date}`);

    // Get all farmers
    const { data: farmers, error: farmersErr } = await supabase
      .from("users")
      .select("id, phone")
      .eq("role", "farmer")
      .eq("sms_alerts_enabled", true);

    if (farmersErr) {
      console.warn("[Forecast Alert] Error fetching farmers:", farmersErr.message);
      return { success: false, error: farmersErr.message };
    }

    if (!farmers || farmers.length === 0) {
      console.log("[Forecast Alert] No farmers with SMS alerts enabled");
      return { success: true, message: "No farmers to notify" };
    }

    let notificationCount = 0;

    // Format forecast date
    const forecastDateStr = new Date(forecast_date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

    // Send notification to each farmer using existing service
    for (const farmer of farmers) {
      try {
        await sendDemandUpdateNotification(farmer.id, {
          fruit_name,
          demand_level: "medium",
          recommendation: `Expected price Rs. ${predicted_price}/kg on ${forecastDateStr}`,
        });
        notificationCount++;
      } catch (notifErr) {
        console.warn(`[Forecast Alert] Failed to notify farmer ${farmer.id}:`, notifErr.message);
      }
    }

    console.log(`[Forecast Alert] ✅ Notifications sent to ${notificationCount} farmers`);

    // Send SMS if phone numbers available
    const phoneNumbers = farmers.map(f => f.phone).filter(p => p);
    if (phoneNumbers.length > 0) {
      try {
        const smsMessage = `FreshRoute Forecast: ${fruit_name} expected at Rs. ${predicted_price}/kg on ${forecastDateStr}.`;
        const smsBatch = phoneNumbers.map(phone => ({ phone, message: smsMessage }));
        await sendBatchSMS(smsBatch);
        console.log(`[Forecast Alert] ✅ SMS sent to ${phoneNumbers.length} farmers`);
      } catch (smsErr) {
        console.warn("[Forecast Alert] SMS sending failed:", smsErr.message);
      }
    }

    return {
      success: true,
      notificationsSent: notificationCount,
      smsSent: phoneNumbers.length,
    };
  } catch (err) {
    console.error("[Forecast Alert] Error:", err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Send alert when FreshRoute prices are updated for farmers
 * @param {object} priceData - FreshRoute price data {fruit_name, target_date, grades: [{grade, price}]}
 */
async function alertFreshRoutePriceUpdate(priceData) {
  try {
    const { fruit_name, target_date, grades = [] } = priceData;
    
    const dateLabel = target_date || "today";
    const gradeLines = grades
      .slice()
      .sort((a, b) => a.grade.localeCompare(b.grade))
      .map(g => `Grade ${g.grade}: Rs. ${g.price}`)
      .join("\n");

    console.log(`[FreshRoute Alert] Prices updated: ${fruit_name} (${grades.length} grades) - ${dateLabel}`);

    // Get all farmers to notify them about FreshRoute price updates
    const { data: farmers, error: farmersErr } = await supabase
      .from("users")
      .select("id, phone")
      .eq("role", "farmer")
      .eq("sms_alerts_enabled", true);

    if (farmersErr) {
      console.warn("[FreshRoute Alert] Error fetching farmers:", farmersErr.message);
      return { success: false, error: farmersErr.message };
    }

    if (!farmers || farmers.length === 0) {
      console.log("[FreshRoute Alert] No farmers with SMS alerts enabled");
      return { success: true, message: "No farmers to notify" };
    }

    let notificationCount = 0;

    // Send one notification per farmer with all grades included
    for (const farmer of farmers) {
      try {
        const { error } = await supabase.from("notifications").insert({
          user_id: farmer.id,
          title: `💰 ${fruit_name} prices updated`,
          body: `Updated prices for ${dateLabel}:\n${gradeLines}`,
          category: "price_alert",
          severity: "info",
          action_url: "/prices/freshroute",
        });

        if (error) throw error;
        notificationCount++;
      } catch (notifErr) {
        console.warn(`[FreshRoute Alert] Failed to notify farmer ${farmer.id}:`, notifErr.message);
      }
    }

    console.log(`[FreshRoute Alert] ✅ Notifications sent to ${notificationCount} farmers`);

    // Send SMS if phone numbers available
    const phoneNumbers = farmers.map(f => f.phone).filter(p => p);
    if (phoneNumbers.length > 0) {
      try {
        const smsMessage = `FreshRoute: ${fruit_name} prices updated (${dateLabel}).\n${gradeLines}`;
        const smsBatch = phoneNumbers.map(phone => ({ phone, message: smsMessage }));
        await sendBatchSMS(smsBatch);
        console.log(`[FreshRoute Alert] ✅ SMS sent to ${phoneNumbers.length} farmers`);
      } catch (smsErr) {
        console.warn("[FreshRoute Alert] SMS sending failed:", smsErr.message);
      }
    }

    return {
      success: true,
      notificationsSent: notificationCount,
      smsSent: phoneNumbers.length,
    };
  } catch (err) {
    console.error("[FreshRoute Alert] Error:", err.message);
    return { success: false, error: err.message };
  }
}

module.exports = {
  alertEconomicCenterPriceUpdate,
  alertForecastUpdate,
  alertFreshRoutePriceUpdate,
};
