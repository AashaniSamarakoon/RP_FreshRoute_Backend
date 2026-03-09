# SMS Toggle Debug Guide

## Problem: Frontend toggle doesn't update database

The backend API and database update work correctly, but the frontend toggle isn't updating the `sms_alerts_enabled` field.

## Debugging Steps

### 1. Check Browser Network Tab
When you toggle the SMS switch in your frontend:

1. Open browser DevTools (F12)
2. Go to Network tab
3. Toggle the SMS switch
4. Look for a PATCH request to `/api/farmer/sms/preferences`

**Expected:**
- Request Method: `PATCH`
- URL: `http://localhost:4000/api/farmer/sms/preferences`
- Status: `200 OK`

**If missing:** The frontend isn't calling the API at all.

### 2. Check Request Payload
Click on the network request and check the "Payload" or "Request" tab:

**Expected payload:**
```json
{
  "sms_alerts_enabled": false
}
```

**Common issues:**
- Wrong key name (should be `sms_alerts_enabled`, not `sms_enabled`)
- Wrong data type (should be boolean `true`/`false`, not string `"true"`/`"false"`)
- Wrong HTTP method (should be `PATCH`, not `POST` or `PUT`)

### 3. Check Authentication
In the network request headers:

**Expected:**
```
Authorization: Bearer <your_jwt_token>
```

**If missing:** User is not logged in or token is not being sent.

### 4. Check Server Logs
When you toggle, check the backend terminal/console for logs:

**Expected logs:**
```
[SMS Update] User <user_id> requesting update: { sms_alerts_enabled: false, type: 'boolean', normalized: false }
[SMS Update] Final updates object: { sms_alerts_enabled: false }
[SMS Update] Successfully updated SMS preferences for user <user_id>: { id: '...', sms_alerts_enabled: false, ... }
```

**If missing:** The API call isn't reaching the backend.

### 5. Test API Directly
Use this curl command to test the API directly:

```bash
curl -X PATCH http://localhost:4000/api/farmer/sms/preferences \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"sms_alerts_enabled": false}'
```

Replace `YOUR_JWT_TOKEN` with a valid token.

## Frontend Code Examples

### Correct Implementation

```javascript
// Toggle handler
async function toggleSMS(enabled) {
  try {
    const response = await fetch('/api/farmer/sms/preferences', {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${userToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sms_alerts_enabled: enabled  // Boolean true/false
      })
    });

    if (response.ok) {
      const result = await response.json();
      console.log('SMS updated:', result.preferences.sms_alerts_enabled);
      // Update your UI state here
    } else {
      console.error('Failed to update SMS:', await response.text());
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

// Usage
toggleSwitch.addEventListener('change', (event) => {
  toggleSMS(event.target.checked);
});
```

### Common Frontend Mistakes

1. **Wrong data type:**
```javascript
// ❌ Wrong - sends string
body: JSON.stringify({ sms_alerts_enabled: "false" })

// ✅ Correct - sends boolean
body: JSON.stringify({ sms_alerts_enabled: false })
```

2. **Wrong key name:**
```javascript
// ❌ Wrong
body: JSON.stringify({ sms_enabled: false })

// ✅ Correct
body: JSON.stringify({ sms_alerts_enabled: false })
```

3. **Wrong HTTP method:**
```javascript
// ❌ Wrong
method: 'POST'

// ✅ Correct
method: 'PATCH'
```

4. **Missing auth:**
```javascript
// ❌ Wrong - no Authorization header
headers: { 'Content-Type': 'application/json' }

// ✅ Correct
headers: {
  'Authorization': `Bearer ${token}`,
  'Content-Type': 'application/json'
}
```

## Frontend Implementation

### Complete Working Examples

I've created complete working examples for you:

1. **`sms-toggle-frontend.js`** - Vanilla JavaScript implementation
2. **`sms-settings-example.html`** - HTML page with toggle
3. **`SMSToggle.react.jsx`** - React component
4. **`test-sms-integration.js`** - Integration test

### Key Points for Frontend Implementation

1. **Use PATCH method** to `/api/farmer/sms/preferences`
2. **Send boolean values** (not strings) in the request body
3. **Include Authorization header** with Bearer token
4. **Handle errors gracefully** by reverting the toggle on failure
5. **Show loading states** during API calls

### Example Frontend Code

```javascript
// Correct implementation
async function toggleSMS(enabled) {
  const response = await fetch('/api/farmer/sms/preferences', {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      sms_alerts_enabled: enabled  // Boolean true/false
    })
  });

  if (response.ok) {
    const result = await response.json();
    console.log('Success:', result.preferences.sms_alerts_enabled);
  } else {
    console.error('Failed to update SMS');
    // Revert toggle here
  }
}
```

## Testing Your Implementation

1. **Run the integration test:**
   ```bash
   node test-sms-integration.js
   ```

2. **Check server logs** for `[SMS Update]` messages

3. **Monitor database** to confirm changes:
   ```sql
   SELECT id, first_name, sms_alerts_enabled FROM users WHERE role = 'FARMER';
   ```

## Common Frontend Mistakes

1. **Wrong HTTP method:** Using POST instead of PATCH
2. **Wrong data type:** Sending `"true"` instead of `true`
3. **Wrong key name:** Using `sms_enabled` instead of `sms_alerts_enabled`
4. **Missing auth:** Not sending the Authorization header
5. **Not handling errors:** Not reverting the toggle when API fails

## Quick Fix

If your frontend is sending the wrong data type, the API now accepts both boolean and string values (`"true"`/`"false"`), but it's better to fix the frontend to send proper booleans.

## Verification

After fixing the frontend, test by:
1. Toggle SMS off
2. Check database: `sms_alerts_enabled` should be `false`
3. Toggle SMS on
4. Check database: `sms_alerts_enabled` should be `true`

The backend is working correctly - the issue is in the frontend API call.