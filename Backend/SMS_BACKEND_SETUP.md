# SMS Backend Configuration Guide

## Current Status ✅

Your SMS backend is **fully configured and working locally**. The 404 error you're seeing is because your frontend is pointing to the ngrok URL (`https://kenneth-unprevaricating-nonrevoltingly.ngrok-free.dev`) instead of your local server.

## 🔧 Backend Configuration Verification

### Files in Place ✅
- `controllers/farmer/smsController.js` - SMS preference functions
- `routes/farmer/index.js` - SMS routes configured
- `Services/auth.js` - Authentication middleware
- `index.js` - Routes mounted with auth

### Authentication Setup ✅
- JWT token validation via Supabase
- Role-based access control (farmer role required)
- Bearer token authentication
- User ID extraction from JWT

### API Endpoints ✅
```
GET  /api/farmer/sms/preferences  - Get SMS settings
PATCH /api/farmer/sms/preferences - Update SMS settings
```

## 🚀 Deployment Options

### Option 1: Local Development (Recommended for Testing)
Your local server is working perfectly. Point your frontend to:
```
http://localhost:4000
```

### Option 2: Production Deployment
For your ngrok URL to work, deploy these files to your production server:

**Files to Deploy:**
1. `controllers/farmer/smsController.js`
2. Update `routes/farmer/index.js` (SMS routes already added)
3. Ensure `Services/auth.js` is deployed
4. Update main server file with farmer routes

**Server Restart Required:**
```bash
# After deploying files
npm restart
# or
pm2 restart your-app
# or redeploy to your hosting platform
```

## 🧪 Testing Your Setup

### Local Testing
```bash
cd Backend
node verify-sms-setup.js      # Backend verification
node test-sms-auth.js         # Authentication test
```

### Production Testing
Replace `localhost:4000` with your ngrok URL in the test scripts.

## 🔐 Authentication Flow

```
Frontend Request → ngrok → Your Server → authMiddleware → requireRole("farmer") → smsController
     ↓               ↓         ↓             ↓                    ↓                  ↓
  Bearer Token    Routing   JWT Verify    Role Check        User ID          Database
```

## 📱 Frontend Integration

### For Local Development
```javascript
const API_BASE = 'http://localhost:4000'; // Use local server

const response = await fetch(`${API_BASE}/api/farmer/sms/preferences`, {
  method: 'PATCH',
  headers: {
    'Authorization': `Bearer ${userToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    sms_alerts_enabled: true
  })
});
```

### For Production
```javascript
const API_BASE = 'https://kenneth-unprevaricating-nonrevoltingly.ngrok-free.dev';

const response = await fetch(`${API_BASE}/api/farmer/sms/preferences`, {
  method: 'PATCH',
  headers: {
    'Authorization': `Bearer ${userToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    sms_alerts_enabled: true
  })
});
```

## 🐛 Troubleshooting

### 404 Error on ngrok URL
**Cause:** Backend files not deployed to production server
**Solution:** Deploy the SMS controller and routes to your production server

### 401 Authentication Error
**Cause:** Invalid or missing JWT token
**Solution:** Ensure user is logged in and token is valid

### 403 Forbidden Error
**Cause:** User doesn't have "farmer" role
**Solution:** Check user role in database

### Database Not Updating
**Cause:** API call failing or wrong data format
**Solution:** Check server logs for `[SMS Update]` messages

## 📋 Quick Setup Checklist

- [x] SMS controller created
- [x] Routes configured
- [x] Authentication working
- [x] Local server tested
- [ ] Production server updated (if using ngrok)
- [ ] Frontend API_BASE updated
- [ ] JWT tokens working
- [ ] Database updates verified

## 🎯 Next Steps

1. **For immediate testing:** Use `http://localhost:4000` in your frontend
2. **For production:** Deploy backend files to your ngrok server
3. **Test thoroughly:** Use the provided test scripts
4. **Monitor logs:** Check for `[SMS Update]` messages

Your backend is correctly configured! The issue is just about which server URL your frontend is pointing to. 🚀