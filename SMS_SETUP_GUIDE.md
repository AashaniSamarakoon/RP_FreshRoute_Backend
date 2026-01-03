# SMS Alert Service Setup Guide

## Current Status

✅ SMS alert service is configured and working
✅ Forecasts and farmers data connected
✅ Phone number formatting working (+94 country code)
✅ SMS logs table created

## Issue: Not Receiving SMS

The most common reason is that **Twilio is not properly configured** or you're using an invalid Twilio number.

### Step 1: Check Your Twilio Configuration

Your `.env` file should have:

```env
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx  (starts with AC)
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=+1234567890  (Your Twilio phone number - NOT your personal number)
SMS_MORNING_HOUR=6
SMS_TIMEZONE=Asia/Colombo
```

**Important:** 
- `TWILIO_PHONE_NUMBER` must be a valid **Twilio-provided number** from your account
- It **cannot be the same** as your personal phone number
- It **cannot be your test receiving number**

### Step 2: Get Your Twilio Number

1. Go to [twilio.com](https://www.twilio.com)
2. Sign up and verify your account
3. Go to **Phone Numbers** section
4. Get a Twilio trial number (e.g., +1-XXX-XXX-XXXX)
5. Copy this to `TWILIO_PHONE_NUMBER` in `.env`

### Step 3: Test SMS Manually

```bash
# Replace with YOUR Twilio number and a different receiving number
node scripts/test-sms-send.js 0701234567

# Check logs
node scripts/check-sms-logs.js
```

### Step 4: Enable SMS Alerts for Farmers

In Supabase, run:

```sql
-- Enable SMS alerts for all farmers
UPDATE users 
SET sms_alerts_enabled = true, sms_frequency = 'daily'
WHERE role = 'farmer';

-- Or enable for specific farmer
UPDATE users 
SET sms_alerts_enabled = true
WHERE id = 'farmer_uuid_here';
```

### Step 5: Trigger Alert Manually (for testing)

```bash
node --% -e "require('./services/smsScheduler').triggerSMSNow().then(() => { console.log('Done'); process.exit(0); });"
```

### Step 6: Wait for Daily Trigger

The SMS alert runs automatically at **6:00 AM** daily (configurable via `SMS_MORNING_HOUR`).

## What SMS Forecasts Include

Each farmer receives one SMS with today's forecasts grouped by fruit:

```
📱 FreshRoute Daily Forecast Alert
Hello [Farmer Name]!

🥭 Mango
📈 Demand: 1200 units
💰 Price: Rs. 180.50/kg

---

🍍 Pineapple
📈 Demand: 450 units

Check FreshRoute app for detailed analysis!
```

## Phone Number Formats Supported

The system automatically converts these formats to +94XXXXXXXXX:

| Input | Output |
|-------|--------|
| `0703101244` | `+94703101244` |
| `703101244` | `+94703101244` |
| `070-310-1244` | `+94703101244` |
| `+94 703 101 244` | `+94703101244` |
| `+1-202-555-0173` | `+1-202-555-0173` |

## Troubleshooting

### SMS logs show "failed"
- Check Twilio credentials in `.env`
- Verify `TWILIO_PHONE_NUMBER` is valid (starts with +)
- Verify receiving phone number format (+94...)

### No SMS logs appearing
- Check if farmers have `sms_alerts_enabled = true`
- Check if farmers have valid phone numbers
- Check if forecasts exist for today

### SMS logging database error
- Ensure `sms_logs` table exists in Supabase
- Run SQL schema creation from this guide

## Monitoring

### View Recent SMS Logs
```bash
node scripts/check-sms-logs.js
```

### View Farmer SMS Status
In Supabase, run:
```sql
SELECT id, name, phone, sms_alerts_enabled, sms_frequency 
FROM users 
WHERE role = 'farmer';
```

### View Today's Forecasts
```sql
SELECT DISTINCT fruit, target, forecast_value 
FROM forecasts 
WHERE date = TODAY();
```

## Production Considerations

1. **Rate Limiting**: Twilio has rate limits; check your Twilio dashboard
2. **Costs**: Twilio charges per SMS; monitor usage
3. **Timezones**: SMS sends at `SMS_MORNING_HOUR` in `SMS_TIMEZONE`
4. **Logs**: Keep `sms_logs` table clean by archiving old records

---

**Next Step:** Follow Step 1-2 to set up Twilio, then run the test command!
