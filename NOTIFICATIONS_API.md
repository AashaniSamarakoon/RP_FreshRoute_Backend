# Notifications API Documentation

## Base URL
```
GET /api/farmer/notifications
```

---

## Endpoints

### 1. Get All Notifications
**GET** `/api/farmer/notifications`

**Query Parameters:**
- `limit` (number, optional): Default 20. Number of notifications to return
- `offset` (number, optional): Default 0. Pagination offset
- `read` (boolean, optional): Filter by read status (true = read, false = unread)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "user_id": "uuid",
      "title": "📈 Mango Price Alert",
      "body": "Current: Rs. 450/kg | Forecast: Rs. 520/kg",
      "category": "price_alert",
      "severity": "info",
      "action_url": "/prices/mango",
      "read_at": null,
      "created_at": "2026-01-04T08:45:00Z"
    }
  ],
  "unreadCount": 5,
  "total": 20
}
```

---

### 2. Get Single Notification
**GET** `/api/farmer/notifications/:id`

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "user_id": "uuid",
    "title": "📈 Mango Price Alert",
    "body": "Current: Rs. 450/kg | Forecast: Rs. 520/kg",
    "category": "price_alert",
    "severity": "info",
    "action_url": "/prices/mango",
    "read_at": null,
    "created_at": "2026-01-04T08:45:00Z"
  }
}
```

---

### 3. Mark Notification as Read
**PUT** `/api/farmer/notifications/:id/read`

**Response:**
```json
{
  "success": true,
  "message": "Marked as read"
}
```

---

### 4. Mark All Notifications as Read
**PUT** `/api/farmer/notifications/read-all`

**Response:**
```json
{
  "success": true,
  "message": "All notifications marked as read"
}
```

---

### 5. Delete Notification
**DELETE** `/api/farmer/notifications/:id`

**Response:**
```json
{
  "success": true,
  "message": "Notification deleted"
}
```

---

### 6. Get Notification Statistics
**GET** `/api/farmer/notifications/stats`

**Response:**
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

### 7. Get Notifications by Category
**GET** `/api/farmer/notifications/category/:category`

**Parameters:**
- `category`: One of: `price_alert`, `demand_update`, `tip`, `system`

**Query Parameters:**
- `limit` (number, optional): Default 20
- `offset` (number, optional): Default 0

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "user_id": "uuid",
      "title": "📈 Mango Price Alert",
      "body": "Current: Rs. 450/kg | Forecast: Rs. 520/kg",
      "category": "price_alert",
      "severity": "info",
      "action_url": "/prices/mango",
      "read_at": null,
      "created_at": "2026-01-04T08:45:00Z"
    }
  ],
  "total": 25
}
```

---

## Notification Categories

| Category | Description | Severity | Icon |
|----------|-------------|----------|------|
| `price_alert` | Price changes and forecasts | info/warning/critical | 📈📉➡️ |
| `demand_update` | Demand level changes | info/critical | 🚀📊⬇️ |
| `tip` | Farming tips and advice | info | 💡 |
| `system` | System messages | info/warning/critical | ℹ️⚠️🚨 |

---

## Notification Severity Levels

| Severity | Description | Usage |
|----------|-------------|-------|
| `info` | Informational | General alerts |
| `warning` | Warning | Important changes |
| `critical` | Critical | Urgent alerts |

---

## Frontend Integration Examples

### React Native (Expo)
```javascript
import { useEffect, useState } from 'react';
import { FlatList, View, Text, TouchableOpacity } from 'react-native';

export function NotificationsScreen() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchNotifications();
    // Refresh every 10 seconds
    const interval = setInterval(fetchNotifications, 10000);
    return () => clearInterval(interval);
  }, []);

  async function fetchNotifications() {
    try {
      const response = await fetch('/api/farmer/notifications?limit=50', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const { data, unreadCount } = await response.json();
      setNotifications(data);
      setUnreadCount(unreadCount);
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleRead(id) {
    await fetch(`/api/farmer/notifications/${id}/read`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` }
    });
    fetchNotifications(); // Refresh
  }

  async function handleDelete(id) {
    await fetch(`/api/farmer/notifications/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    fetchNotifications();
  }

  return (
    <View>
      <Text>Unread: {unreadCount}</Text>
      <FlatList
        data={notifications}
        renderItem={({ item }) => (
          <View style={{ padding: 10, borderBottomWidth: 1 }}>
            <Text style={{ fontWeight: 'bold' }}>{item.title}</Text>
            <Text>{item.body}</Text>
            <Text style={{ fontSize: 12, color: 'gray' }}>
              {new Date(item.created_at).toLocaleString()}
            </Text>
            {!item.read_at && (
              <TouchableOpacity onPress={() => handleRead(item.id)}>
                <Text style={{ color: 'blue' }}>Mark as read</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => handleDelete(item.id)}>
              <Text style={{ color: 'red' }}>Delete</Text>
            </TouchableOpacity>
          </View>
        )}
      />
    </View>
  );
}
```

### React Web
```javascript
import { useEffect, useState } from 'react';

export function NotificationBell() {
  const [notifications, setNotifications] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => {
    // Fetch notifications
    fetch('/api/farmer/notifications?limit=10')
      .then(r => r.json())
      .then(({ data, unreadCount }) => {
        setNotifications(data);
        document.title = unreadCount > 0 ? `(${unreadCount}) FreshRoute` : 'FreshRoute';
      });
  }, []);

  const handleMarkAllRead = async () => {
    await fetch('/api/farmer/notifications/read-all', { method: 'PUT' });
    setNotifications(n => n.map(x => ({ ...x, read_at: new Date() })));
  };

  return (
    <div className="notification-bell">
      <button onClick={() => setShowDropdown(!showDropdown)}>
        🔔 {notifications.filter(n => !n.read_at).length}
      </button>
      {showDropdown && (
        <div className="notification-dropdown">
          <div className="header">
            <h3>Notifications</h3>
            <button onClick={handleMarkAllRead}>Mark all as read</button>
          </div>
          {notifications.map(notif => (
            <div key={notif.id} className={`notification ${notif.read_at ? 'read' : 'unread'}`}>
              <div className="title">{notif.title}</div>
              <div className="body">{notif.body}</div>
              <div className="time">{new Date(notif.created_at).toLocaleTimeString()}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

---

## Testing API

### Test with cURL
```bash
# Get notifications
curl -X GET "http://localhost:4000/api/farmer/notifications?limit=10" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Get stats
curl -X GET "http://localhost:4000/api/farmer/notifications/stats" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Mark as read
curl -X PUT "http://localhost:4000/api/farmer/notifications/{id}/read" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Get by category
curl -X GET "http://localhost:4000/api/farmer/notifications/category/price_alert" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## Backend Integration

### Send Price Alert Notification
```javascript
const { sendPriceAlertNotification } = require('./services/notificationsService');

// After generating forecast
await sendPriceAlertNotification(farmerId, {
  fruit_name: 'Mango',
  current_price: 450,
  forecast_price: 520,
  trend: 'up' // or 'down'
});
```

### Send Demand Update Notification
```javascript
const { sendDemandUpdateNotification } = require('./services/notificationsService');

await sendDemandUpdateNotification(farmerId, {
  fruit_name: 'Pineapple',
  demand_level: 'high', // or 'medium', 'low'
  recommendation: 'High demand! Consider increasing production'
});
```

### Send Broadcast Notification to All Farmers
```javascript
const { sendBroadcastNotification } = require('./services/notificationsService');

await sendBroadcastNotification('farmer', {
  title: '🌱 System Update',
  body: 'New features available in FreshRoute app',
  category: 'system',
  severity: 'info'
});
```

---

## Notes

1. All endpoints require authentication (Authorization header with JWT token)
2. Notifications are stored indefinitely unless deleted
3. For real-time updates, consider implementing WebSocket/Socket.io or Supabase Realtime
4. Always set `read_at` when user views a notification to provide accurate metrics
