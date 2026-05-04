# Frontend SMS Preferences Integration Guide

## Problem Analysis
Your backend SMS preferences endpoint is working correctly on both local and production servers. The 401 "Missing token" response indicates the endpoint exists but requires authentication.

## Frontend Integration Steps

### 1. API Base URL Configuration
Update your frontend to use the correct base URL:
```javascript
// For production
const API_BASE_URL = 'https://kenneth-unprevaricating-nonrevoltingly.ngrok-free.dev';

// For local development
// const API_BASE_URL = 'http://127.0.0.1:4000';
```

### 2. Authentication Headers
All API requests must include the JWT token in the Authorization header:
```javascript
const headers = {
  'Authorization': `Bearer ${userToken}`, // Get token from your auth state
  'Content-Type': 'application/json'
};
```

### 3. SMS Preferences API Calls

#### Get SMS Preferences
```javascript
const getSMSPreferences = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/farmer/sms/preferences`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${userToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.status === 401) {
      // Token expired or invalid - redirect to login
      console.log('Authentication required');
      return null;
    }

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data; // { sms_alerts_enabled: true/false }
  } catch (error) {
    console.error('Error fetching SMS preferences:', error);
    return null;
  }
};
```

#### Update SMS Preferences
```javascript
const updateSMSPreferences = async (enabled) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/farmer/sms/preferences`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${userToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sms_alerts_enabled: enabled // boolean: true or false
      })
    });

    if (response.status === 401) {
      // Token expired or invalid - redirect to login
      console.log('Authentication required');
      return false;
    }

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data.success; // true if update successful
  } catch (error) {
    console.error('Error updating SMS preferences:', error);
    return false;
  }
};
```

### 4. Toggle Button Implementation
```javascript
const SMSToggleButton = ({ initialValue, onToggle }) => {
  const [isEnabled, setIsEnabled] = useState(initialValue);
  const [loading, setLoading] = useState(false);

  const handleToggle = async () => {
    setLoading(true);
    const newValue = !isEnabled;

    const success = await updateSMSPreferences(newValue);
    if (success) {
      setIsEnabled(newValue);
      onToggle?.(newValue);
    }

    setLoading(false);
  };

  return (
    <button
      onClick={handleToggle}
      disabled={loading}
      style={{
        opacity: loading ? 0.6 : 1,
        backgroundColor: isEnabled ? '#4CAF50' : '#f44336'
      }}
    >
      {loading ? 'Updating...' : `SMS Alerts: ${isEnabled ? 'ON' : 'OFF'}`}
    </button>
  );
};
```

### 5. Error Handling
- **401 Unauthorized**: Token is missing, expired, or invalid → redirect to login
- **403 Forbidden**: User doesn't have farmer role → show permission error
- **404 Not Found**: Endpoint doesn't exist → check API URL
- **500 Internal Server Error**: Backend error → show generic error message

### 6. Testing Checklist
- [ ] API base URL points to correct server
- [ ] JWT token is included in all requests
- [ ] Token is valid and not expired
- [ ] User has 'farmer' role
- [ ] Network requests are not blocked by CORS
- [ ] Handle offline/network errors gracefully

### 7. Common Issues
1. **"Missing token"**: Authorization header not sent or malformed
2. **"Invalid token"**: JWT token expired or corrupted
3. **"Insufficient permissions"**: User role is not 'farmer'
4. **CORS errors**: Frontend domain not allowed by backend

## Next Steps
1. Update your frontend API configuration
2. Ensure JWT token is properly stored and sent
3. Test the toggle functionality
4. Handle authentication errors appropriately