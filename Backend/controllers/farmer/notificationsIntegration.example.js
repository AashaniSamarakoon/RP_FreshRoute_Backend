/**
 * COMPLETE EXAMPLE: How to use Notifications in FreshRoute
 * 
 * This file demonstrates how to integrate notifications into your app
 * when forecasts are generated, prices change, etc.
 */

const { supabase } = require("../supabaseClient");
const {
  sendPriceAlertNotification,
  sendDemandUpdateNotification,
  sendTipNotification,
  sendBroadcastNotification,
} = require("../services/notificationsService");

// ============================================================================
// EXAMPLE 1: Send notification when user triggers a forecast
// ============================================================================
async function exampleTriggerForecast(req, res) {
  try {
    const farmerId = req.user.id;
    const { fruit_id, fruit_name } = req.body;

    console.log(`\n📊 Generating forecast for ${fruit_name}...`);

    // Step 1: Generate forecast (your existing logic)
    const forecast = {
      value: 520,
      trend: "up",
      confidence: 85,
    };

    // Step 2: Get current market price
    const { data: priceData, error: priceError } = await supabase
      .from("economic_center_prices")
      .select("price_per_unit")
      .eq("fruit_name", fruit_name)
      .order("captured_at", { ascending: false })
      .limit(1)
      .single();

    if (priceError) {
      throw new Error(`Could not fetch prices: ${priceError.message}`);
    }

    const currentPrice = priceData?.price_per_unit || 0;
    const forecastPrice = forecast.value;

    // Step 3: Send notification to farmer
    console.log(`💬 Sending price alert notification...`);
    await sendPriceAlertNotification(farmerId, {
      fruit_name,
      current_price: currentPrice,
      forecast_price: forecastPrice,
      trend: forecast.trend, // 'up', 'down', 'neutral'
    });

    // Step 4: Return response with notification sent
    return res.json({
      success: true,
      forecast: {
        fruit: fruit_name,
        current_price: currentPrice,
        forecast_price: forecastPrice,
        trend: forecast.trend,
        confidence: forecast.confidence,
      },
      notification: {
        sent: true,
        message: `Notification sent to farmer about ${fruit_name} forecast`,
      },
    });
  } catch (err) {
    console.error("❌ Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}

// ============================================================================
// EXAMPLE 2: Analyze demand and send notification
// ============================================================================
async function exampleDemandAnalysis(req, res) {
  try {
    const farmerId = req.user.id;
    const { fruit_name } = req.body;

    console.log(`\n📈 Analyzing demand for ${fruit_name}...`);

    // Step 1: Analyze demand (your logic)
    const demandScore = 78; // 0-100

    // Determine level
    let demandLevel = "low";
    let recommendation = "Monitor market conditions";

    if (demandScore > 70) {
      demandLevel = "high";
      recommendation = "🚀 HIGH DEMAND - Consider increasing production!";
    } else if (demandScore > 40) {
      demandLevel = "medium";
      recommendation = "📊 Moderate demand - Production at normal levels recommended";
    } else {
      demandLevel = "low";
      recommendation = "⬇️ Low demand - Consider reducing production or focusing on quality";
    }

    // Step 2: Send demand update notification
    console.log(`💬 Sending demand update notification...`);
    await sendDemandUpdateNotification(farmerId, {
      fruit_name,
      demand_level: demandLevel,
      recommendation,
    });

    return res.json({
      success: true,
      demandAnalysis: {
        fruit: fruit_name,
        demandScore,
        level: demandLevel,
        recommendation,
      },
      notification: {
        sent: true,
        message: `Demand analysis notification sent for ${fruit_name}`,
      },
    });
  } catch (err) {
    console.error("❌ Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}

// ============================================================================
// EXAMPLE 3: Send farming tips based on season/crop
// ============================================================================
async function exampleSendFarmingTip(farmerId, fruitName) {
  try {
    console.log(`\n💡 Sending farming tip for ${fruitName}...`);

    // Define tips for different fruits
    const tips = {
      mango: {
        tip_title: "Mango Storage Tips",
        tip_content:
          "Store mangoes at 15-20°C and 85-90% humidity for optimal shelf life. Avoid direct sunlight.",
      },
      pineapple: {
        tip_title: "Pineapple Harvesting",
        tip_content:
          "Harvest when base turns golden yellow and fruit develops sweet aroma. Peak season: Dec-Mar.",
      },
      banana: {
        tip_title: "Banana Disease Prevention",
        tip_content:
          "Prevent Panama disease by rotating crops and using disease-resistant varieties. Monitor soil pH.",
      },
    };

    const tip = tips[fruitName.toLowerCase()] || {
      tip_title: `${fruitName} Best Practices`,
      tip_content: `Research shows proper spacing and irrigation improve ${fruitName} yields by 20-30%.`,
    };

    await sendTipNotification(farmerId, {
      ...tip,
      fruit_name: fruitName,
    });

    console.log(`✅ Tip sent: ${tip.tip_title}`);
  } catch (err) {
    console.error("❌ Tip error:", err.message);
  }
}

// ============================================================================
// EXAMPLE 4: Broadcast system notification to all farmers
// ============================================================================
async function exampleBroadcastPriceSpikeAlert(fruitName, spikePercentage) {
  try {
    console.log(
      `\n📢 Broadcasting price spike alert for ${fruitName} (${spikePercentage}% increase)...`
    );

    await sendBroadcastNotification("farmer", {
      title: `⚠️ ${fruitName} Price Alert!`,
      body: `${fruitName} prices increased by ${spikePercentage.toFixed(1)}% in the last 24 hours. Act now!`,
      category: "price_alert",
      severity: spikePercentage > 20 ? "critical" : "warning",
      action_url: `/prices/${fruitName.toLowerCase()}`,
    });

    console.log(
      `✅ Broadcast sent to all farmers about ${fruitName} price spike`
    );
  } catch (err) {
    console.error("❌ Broadcast error:", err.message);
  }
}

// ============================================================================
// EXAMPLE 5: Fetch and display notifications for mobile app
// ============================================================================
async function exampleGetNotificationsForMobileApp(req, res) {
  try {
    const farmerId = req.user.id;

    // Get unread notifications
    const { data: unreadNotifications, error: unreadError } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", farmerId)
      .is("read_at", null)
      .order("created_at", { ascending: false })
      .limit(10);

    if (unreadError) throw unreadError;

    // Get statistics
    const { data: allNotifications, error: allError } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", farmerId);

    if (allError) throw allError;

    // Count by category
    const byCategory = {};
    allNotifications.forEach((n) => {
      byCategory[n.category] = (byCategory[n.category] || 0) + 1;
    });

    return res.json({
      success: true,
      unread: unreadNotifications,
      unreadCount: unreadNotifications.length,
      stats: {
        total: allNotifications.length,
        byCategory,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

// ============================================================================
// EXAMPLE 6: Mark notification as read when user views it
// ============================================================================
async function exampleMarkNotificationRead(req, res) {
  try {
    const farmerId = req.user.id;
    const { notificationId } = req.body;

    console.log(`✅ Marking notification ${notificationId} as read...`);

    // Verify it belongs to this user
    const { data: notification, error: verifyError } = await supabase
      .from("notifications")
      .select("id")
      .eq("id", notificationId)
      .eq("user_id", farmerId)
      .single();

    if (verifyError || !notification) {
      return res.status(404).json({ error: "Notification not found" });
    }

    // Mark as read
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", notificationId);

    if (error) throw error;

    return res.json({
      success: true,
      message: "Notification marked as read",
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

// ============================================================================
// Export functions for use in routes
// ============================================================================
module.exports = {
  exampleTriggerForecast,
  exampleDemandAnalysis,
  exampleSendFarmingTip,
  exampleBroadcastPriceSpikeAlert,
  exampleGetNotificationsForMobileApp,
  exampleMarkNotificationRead,
};

// ============================================================================
// HOW TO USE IN YOUR ROUTES
// ============================================================================
/*

// In your farmer routes (routes/farmer/index.js):

const examples = require('../../controllers/farmer/notificationIntegration.example');

// Trigger forecast with notification
router.post('/forecast/with-notification', exampleTriggerForecast);

// Analyze demand
router.post('/demand/analyze', exampleDemandAnalysis);

// Get mobile notifications
router.get('/notifications-mobile', exampleGetNotificationsForMobileApp);

// Mark as read
router.post('/notifications/read', exampleMarkNotificationRead);

// ============================================================================

// To send a tip when user asks for it:

app.post('/api/farmer/request-tip', async (req, res) => {
  const { fruit_name } = req.body;
  await exampleSendFarmingTip(req.user.id, fruit_name);
  res.json({ success: true });
});

// ============================================================================

// To broadcast to all farmers (from admin route):

app.post('/api/admin/broadcast-price-alert', async (req, res) => {
  const { fruit_name, spike_percentage } = req.body;
  await exampleBroadcastPriceSpikeAlert(fruit_name, spike_percentage);
  res.json({ success: true });
});

*/
