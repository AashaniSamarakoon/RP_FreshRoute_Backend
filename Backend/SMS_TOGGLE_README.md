# SMS Toggle Functionality

This document explains how the SMS service toggle works in the FreshRoute backend.

## Overview

Farmers can enable/disable SMS notifications for daily price forecasts and alerts. When the SMS toggle button is switched on/off in the frontend, it updates the `sms_alerts_enabled` boolean field in the `users` table.

## Database Schema

```sql
-- The sms_alerts_enabled field in users table
sms_alerts_enabled boolean null default false
```

## API Endpoints

### Get SMS Preferences
```
GET /api/farmer/sms/preferences
Authorization: Bearer <farmer_jwt_token>
```

**Response:**
```json
{
  "preferences": {
    "id": "uuid",
    "phone": "+94712345678",
    "sms_alerts_enabled": true,
    "sms_frequency": "daily"
  }
}
```

### Update SMS Preferences
```
PATCH /api/farmer/sms/preferences
Authorization: Bearer <farmer_jwt_token>
Content-Type: application/json

{
  "sms_alerts_enabled": true
}
```

**Request Body Options:**
- `sms_alerts_enabled`: boolean (true/false) - Enable/disable SMS alerts
- `phone`: string - Update phone number
- `sms_frequency`: string - "daily", "weekly", or "never"

**Response:**
```json
{
  "message": "SMS preferences updated",
  "preferences": {
    "id": "uuid",
    "phone": "+94712345678",
    "sms_alerts_enabled": true,
    "sms_frequency": "daily"
  }
}
```

## Frontend Integration

### Toggle Button Implementation

```javascript
// Example toggle button handler
async function toggleSMS(enabled) {
  try {
    const response = await fetch('/api/farmer/sms/preferences', {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${userToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sms_alerts_enabled: enabled
      })
    });

    const result = await response.json();
    if (response.ok) {
      console.log('SMS toggled successfully:', result.preferences.sms_alerts_enabled);
      // Update UI state
    } else {
      console.error('Failed to toggle SMS:', result.message);
    }
  } catch (error) {
    console.error('Error toggling SMS:', error);
  }
}

// Usage:
toggleButton.addEventListener('change', (event) => {
  toggleSMS(event.target.checked);
});
```

### Get Current State

```javascript
async function loadSMSPreferences() {
  try {
    const response = await fetch('/api/farmer/sms/preferences', {
      headers: {
        'Authorization': `Bearer ${userToken}`
      }
    });

    const result = await response.json();
    if (response.ok) {
      const isEnabled = result.preferences.sms_alerts_enabled;
      toggleButton.checked = isEnabled;
      console.log('SMS is', isEnabled ? 'enabled' : 'disabled');
    }
  } catch (error) {
    console.error('Error loading SMS preferences:', error);
  }
}
```

## Validation

The API validates:
- `sms_alerts_enabled` must be a boolean (true/false)
- `sms_frequency` must be one of: "daily", "weekly", "never"
- At least one field must be provided for updates

## Testing

Use the provided test scripts:
- `test-sms-toggle.js` - Basic toggle test
- `test-sms-toggle-comprehensive.js` - Full functionality test

## SMS Scheduling

When `sms_alerts_enabled` is `true`, farmers receive:
- Daily price forecast SMS at 6:00 AM local time
- Price update alerts when significant changes occur
- FreshRoute price alerts

## Troubleshooting

### Common Issues

1. **"Authenticate" error**: Invalid Twilio credentials (see main README)
2. **400 Bad Request**: Invalid boolean value sent
3. **401 Unauthorized**: Invalid or missing JWT token
4. **403 Forbidden**: User doesn't have "farmer" role

### Debug Commands

```bash
# Check farmer SMS settings
node scripts/debug-sms-alerts.js

# Test SMS sending
node scripts/test-notifications.js

# Check SMS logs
node scripts/debug-all-users.js
```