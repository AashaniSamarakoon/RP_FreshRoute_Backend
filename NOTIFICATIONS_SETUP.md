# Real-Time Notifications Setup Summary

## ✅ Components Created

### 1. Database Triggers (SQL)
**File:** `scripts/setup-notification-triggers.sql`

Auto-creates notifications when:
- ✅ New forecasts inserted
- ✅ Economic center prices updated  
- ✅ SMS logs created
- ✅ System events occur

**To apply triggers:**
```bash
# Copy SQL from setup-notification-triggers.sql and run in Supabase
# Or use psql:
psql postgresql://user:password@host/database < scripts/setup-notification-triggers.sql
```

---

### 2. Notification Service
**File:** `services/notificationService.js`

Functions:
- `sendNotification(userId, {title, body, category, severity})`
- `sendBulkNotifications(userIds, data)`
- `notifyPriceUpdate(fruit, price, economicCenter, trend)`
- `notifyForecast(fruit, forecastValue, date)`
- `markAsRead(notificationId, userId)`
- `markAllAsRead(userId)`
- `deleteOldNotifications()`

---

### 3. API Controller
**File:** `controllers/farmer/notificationsController.js`

Endpoints:
- `GET /api/notifications` - Get all notifications
- `GET /api/notifications/unread-count` - Get unread count
- `GET /api/notifications/stats` - Get statistics
- `GET /api/notifications/category/:category` - Filter by category
- `GET /api/notifications/:id` - Get single notification
- `PUT /api/notifications/:id/read` - Mark as read
- `PUT /api/notifications/read-all` - Mark all as read
- `DELETE /api/notifications/:id` - Delete notification

---

### 4. API Routes
**File:** `routes/notificationRoutes.js`

All routes require authentication and farmer role.

---

## 🚀 How It Works (Real-Time Flow)

```
1. Farmer data updated (forecast/price)
   ↓
2. Database trigger fires
   ↓
3. Notification automatically inserted into DB
   ↓
4. Mobile app listens via Supabase Realtime
   ↓
5. App receives notification instantly
   ↓
6. Show alert/badge to farmer
```

---

## 📱 Mobile App Implementation

### Listen to Real-Time Updates
```javascript
const subscription = supabase
  .channel(`notifications:${farmerId}`)
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'notifications',
    filter: `user_id=eq.${farmerId}`
  }, (payload) => {
    // New notification received
    showNotification(payload.new);
  })
  .subscribe();
```

### Fetch Notifications
```javascript
const { data } = await fetch('/api/notifications?limit=20&offset=0');
```

### Mark as Read
```javascript
await fetch(`/api/notifications/${notificationId}/read`, { method: 'PUT' });
```

---

## 🔧 Integration Steps

### Step 1: Apply Database Triggers
1. Go to Supabase → SQL Editor
2. Copy content from `scripts/setup-notification-triggers.sql`
3. Run the SQL
4. Verify triggers created: `SELECT * FROM pg_trigger WHERE tgname LIKE 'notify%';`

### Step 2: Add Notification Routes to Backend
Update `index.js`:
```javascript
const notificationRoutes = require('./routes/notificationRoutes');
app.use('/api/notifications', notificationRoutes);
```

### Step 3: Mobile App Setup
```javascript
// On app startup
useEffect(() => {
  // Listen to real-time notifications
  subscribeToNotifications(farmerId);
  
  // Load existing notifications
  loadNotifications();
}, []);
```

### Step 4: Test
```bash
# Insert a forecast (should auto-create notifications)
INSERT INTO forecasts (fruit, target, date, forecast_value) 
VALUES ('Mango', 'price', CURRENT_DATE, 650.00);

# Check notifications table
SELECT * FROM notifications WHERE created_at > NOW() - INTERVAL '1 minute';
```

---

## 📊 Notification Categories

| Category | Trigger | Example |
|----------|---------|---------|
| `price_alert` | New price/forecast | "Mango up to Rs. 650/kg" |
| `demand_update` | Demand change | "High demand for pineapple" |
| `tip` | Tips/advice | "Best time to sell mangoes" |
| `system` | SMS sent, errors | "Alert sent to your phone" |

---

## 🎨 Notification Severity

| Severity | Color | Use Case |
|----------|-------|----------|
| `info` | Blue | Regular updates |
| `warning` | Yellow | Price changes >50rs |
| `critical` | Red | Price changes >100rs |

---

## ✨ Features

✅ **Real-time via Supabase Realtime**
- 1-2 second delay
- Works while app is open
- No polling required

✅ **Automatic via Database Triggers**
- No code changes needed
- Scales automatically
- Consistent & reliable

✅ **Rich API**
- Filter by category
- Get statistics
- Mark read/unread
- Delete old notifications

✅ **Mobile-Friendly**
- Unread counts
- Badge notifications
- Easy integration

---

## 🐛 Troubleshooting

**No notifications appearing?**
1. Check triggers created: `SELECT * FROM pg_trigger WHERE tgrelid='notifications'::regclass;`
2. Check SMS logs to verify trigger is firing
3. Check notification table: `SELECT * FROM notifications LIMIT 5;`

**Realtime not working?**
1. Ensure Supabase Realtime is enabled
2. Check network connection
3. Verify user_id matches logged-in user

**API returning 401?**
1. Check Authorization header
2. Verify token is valid
3. Ensure user has farmer role

---

## 📚 Next Steps

1. ✅ Apply SQL triggers to database
2. ✅ Add routes to index.js
3. ✅ Test with curl/Postman
4. ✅ Integrate with mobile app
5. Optional: Add Firebase push notifications
6. Optional: Add email notifications

---

## Files Reference

- **SQL Triggers:** `scripts/setup-notification-triggers.sql`
- **Backend Service:** `services/notificationService.js`
- **API Controller:** `controllers/farmer/notificationsController.js`
- **API Routes:** `routes/notificationRoutes.js`
- **API Docs:** `NOTIFICATIONS_API.md`
