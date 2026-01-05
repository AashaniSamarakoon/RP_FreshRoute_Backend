# Notifications API - Quick Reference

## ✅ System Status
- Backend: Ready to send notifications
- API Endpoints: Implemented and tested
- Database: Notifications table populated
- Frontend Integration: Ready for mobile/web app

---

## API Endpoints Summary

| Method | Endpoint | Purpose |
|--------|----------|---------|
| **GET** | `/api/farmer/notifications` | Get all notifications (with pagination) |
| **GET** | `/api/farmer/notifications/:id` | Get single notification |
| **GET** | `/api/farmer/notifications/stats` | Get statistics (total, unread, by category) |
| **GET** | `/api/farmer/notifications/category/:category` | Filter by category |
| **PUT** | `/api/farmer/notifications/:id/read` | Mark single notification as read |
| **PUT** | `/api/farmer/notifications/read-all` | Mark all as read |
| **DELETE** | `/api/farmer/notifications/:id` | Delete notification |

---

## Backend Service Functions

### Sending Notifications

```javascript
// 1. Price Alert
await sendPriceAlertNotification(farmerId, {
  fruit_name: 'Mango',
  current_price: 450,
  forecast_price: 520,
  trend: 'up' // 'up', 'down', 'neutral'
});

// 2. Demand Update
await sendDemandUpdateNotification(farmerId, {
  fruit_name: 'Pineapple',
  demand_level: 'high', // 'high', 'medium', 'low'
  recommendation: 'Increase production!'
});

// 3. Farming Tip
await sendTipNotification(farmerId, {
  tip_title: 'Mango Storage',
  tip_content: 'Store at 15-20°C for best shelf life',
  fruit_name: 'Mango'
});

// 4. System Notification
await sendSystemNotification(farmerId, {
  message: 'Your account has been updated',
  severity: 'info' // 'info', 'warning', 'critical'
});

// 5. Broadcast to All Farmers
await sendBroadcastNotification('farmer', {
  title: 'System Update',
  body: 'New features available',
  category: 'system',
  severity: 'info'
});
```

---

## Sample Response

### Get Notifications
```json
{
  "success": true,
  "data": [
    {
      "id": "e7b7a951-62c3-4b79-9a67-82522584d8f0",
      "user_id": "5fa6ccfc-a21d-476b-b99f-9bc75e146e69",
      "title": "📈 Mango Price Alert",
      "body": "Current: Rs. 450/kg | Forecast: Rs. 520/kg",
      "category": "price_alert",
      "severity": "info",
      "action_url": "/prices/mango",
      "read_at": null,
      "created_at": "2026-01-04T09:27:19.310674+00:00"
    },
    {
      "id": "d9718c2a-6466-4478-9764-8024f94dd82d",
      "user_id": "5fa6ccfc-a21d-476b-b99f-9bc75e146e69",
      "title": "🚀 Pineapple Demand Update",
      "body": "Demand: high | Recommendation: Increase production!",
      "category": "demand_update",
      "severity": "critical",
      "action_url": "/demand/pineapple",
      "read_at": null,
      "created_at": "2026-01-04T09:27:19.77398+00:00"
    }
  ],
  "unreadCount": 2,
  "total": 2
}
```

### Get Stats
```json
{
  "success": true,
  "stats": {
    "total": 45,
    "unread": 5,
    "byCategory": {
      "price_alert": 25,
      "demand_update": 12,
      "tip": 6,
      "system": 2
    }
  }
}
```

---

## How to Integrate in Forecast Generation

**File:** `controllers/farmer/farmerController.js` (in your forecast endpoint)

```javascript
async function triggerForecastAndNotify(req, res) {
  try {
    const { fruit_id, fruit_name } = req.body;
    const farmerId = req.user.id;

    // 1. Generate forecast
    const forecast = await generateForecast(fruit_id, fruit_name);

    // 2. Get current price
    const { data: priceData } = await supabase
      .from("economic_center_prices")
      .select("price_per_unit")
      .eq("fruit_name", fruit_name)
      .order("captured_at", { ascending: false })
      .limit(1)
      .single();

    // 3. Determine trend
    let trend = "neutral";
    if (forecast.value > priceData.price_per_unit * 1.1) trend = "up";
    if (forecast.value < priceData.price_per_unit * 0.9) trend = "down";

    // 4. Send notification
    const { sendPriceAlertNotification } = require("../../services/notificationsService");
    await sendPriceAlertNotification(farmerId, {
      fruit_name,
      current_price: priceData.price_per_unit,
      forecast_price: forecast.value,
      trend
    });

    return res.json({
      success: true,
      forecast,
      message: "Forecast generated and notification sent"
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
```

---

## Files Created

1. **`services/notificationsService.js`** - Backend service to send notifications
2. **`controllers/farmer/notificationsController.js`** - API endpoints
3. **`routes/farmer/index.js`** - Updated with notification routes
4. **`NOTIFICATIONS_API.md`** - Full API documentation with examples

---

## Testing in Postman/cURL

```bash
# Get notifications
curl -X GET "http://localhost:4000/api/farmer/notifications" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Get stats
curl -X GET "http://localhost:4000/api/farmer/notifications/stats" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Mark as read
curl -X PUT "http://localhost:4000/api/farmer/notifications/{id}/read" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Get price alerts only
curl -X GET "http://localhost:4000/api/farmer/notifications/category/price_alert" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## Next Steps for Frontend

1. **Fetch notifications** on app load:
   ```javascript
   GET /api/farmer/notifications?limit=20
   ```

2. **Show unread badge**:
   ```javascript
   GET /api/farmer/notifications/stats
   // Use `stats.unread` for badge count
   ```

3. **Mark as read** when user opens notification:
   ```javascript
   PUT /api/farmer/notifications/{id}/read
   ```

4. **Real-time updates** (optional - implement polling or WebSocket):
   ```javascript
   setInterval(() => {
     fetch('/api/farmer/notifications?limit=10')
   }, 10000); // Every 10 seconds
   ```

5. **Display with icons**:
   - Price alerts: 📈📉➡️
   - Demand updates: 🚀📊⬇️
   - Tips: 💡
   - System: ℹ️⚠️🚨

---

## Ready to Use! ✅

The notification system is fully implemented and ready for mobile app integration.
