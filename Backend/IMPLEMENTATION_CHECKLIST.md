# PayHere Payment Integration - Implementation Checklist

## ✅ Files Created

### Backend Controllers

- [x] `Backend/controllers/buyer/paymentController.js` - PayHere preauth, capture, void
- [x] `Backend/controllers/transporter/deliveryController.js` - Delivery & quality confirmation

### Backend Routes

- [x] `Backend/routes/buyer/paymentRoutes.js` - Payment endpoints
- [x] `Backend/routes/transporter/deliveryRoutes.js` - Delivery endpoints

### Database

- [x] `Backend/scripts/create_payments_table.sql` - payments & quality_checks tables

### Blockchain

- [x] `Blockchain/asset-transfer-basic/chaincode-typescript/src/contracts/PaymentContract.ts` - Updated with preauth logic

### Documentation

- [x] `Backend/PAYHERE_PAYMENT_INTEGRATION.md` - Complete API documentation
- [x] `Backend/INTEGRATION_INSTRUCTIONS.md` - Setup instructions
- [x] `Backend/PAYMENT_FLOW_DIAGRAM.md` - Visual flow diagram
- [x] `Backend/IMPLEMENTATION_CHECKLIST.md` - This file

### Modified Files

- [x] `Backend/controllers/farmer/proposalController.js` - Set AWAITING_PAYMENT status

---

## 🚀 Setup Steps

### 1. Install Dependencies

```bash
cd Backend
npm install axios
```

**Status:** [ ] Complete

---

### 2. Update Environment Variables

Add to `.env`:

```env
PAYHERE_MERCHANT_ID=your_merchant_id
PAYHERE_MERCHANT_SECRET=your_merchant_secret
PAYHERE_API_KEY=your_api_key
PAYHERE_API_BASE=https://sandbox.payhere.lk
PAYHERE_RETURN_URL=http://localhost:4000/api/buyer/payment/return
PAYHERE_CANCEL_URL=http://localhost:4000/api/buyer/payment/cancel
PAYHERE_NOTIFY_URL=https://your-ngrok.ngrok.io/api/buyer/payment/notify
```

**Status:** [ ] Complete

---

### 3. Register Routes in index.js

Add these lines to `Backend/index.js`:

```javascript
// Near the top with other route imports:
const paymentRoutes = require("./routes/buyer/paymentRoutes");
const deliveryRoutes = require("./routes/transporter/deliveryRoutes");

// Near the bottom with other route registrations:
app.use("/api/buyer/payment", paymentRoutes);
app.use("/api/transporter/delivery", deliveryRoutes);
```

**Status:** [ ] Complete

---

### 4. Run Database Migration

```bash
# Connect to Supabase and run:
psql -h db.aiwndjgadyaxuyoioxxa.supabase.co -U postgres -d postgres -f Backend/scripts/create_payments_table.sql

# OR copy SQL from create_payments_table.sql and run in Supabase SQL Editor
```

**Status:** [ ] Complete

**Verify tables created:**

```sql
SELECT * FROM payments LIMIT 1;
SELECT * FROM quality_checks LIMIT 1;
```

**Status:** [ ] Verified

---

### 5. Rebuild and Deploy Chaincode

```bash
cd Blockchain/asset-transfer-basic/chaincode-typescript
npm install
npm run build

cd ../../../test-network
./network.sh deployCC -ccn freshroute -ccp ../asset-transfer-basic/chaincode-typescript -ccl typescript
```

**Status:** [ ] Complete

---

### 6. Setup Ngrok (for local testing)

```bash
ngrok http 4000
# Copy the https URL and update PAYHERE_NOTIFY_URL in .env
```

**Status:** [ ] Complete
**Ngrok URL:** ************\_\_\_************

---

### 7. Get PayHere Credentials

1. Sign up at https://www.payhere.lk/merchant/signup
2. Get sandbox credentials from dashboard
3. Request API key for Capture/Void operations
4. Enable Preapproval feature

**Status:**

- [ ] Account created
- [ ] Merchant ID obtained
- [ ] Merchant Secret obtained
- [ ] API Key obtained
- [ ] Preapproval enabled

---

## 🧪 Testing Checklist

### Test Case 1: Successful Payment Flow

```bash
# Step 1: Farmer accepts proposal
curl -X POST http://localhost:4000/api/farmer/proposals/{id}/accept \
  -H "Authorization: Bearer {farmer_token}"
```

**Expected:** Status: AWAITING_PAYMENT
**Result:** [ ] Pass [ ] Fail

```bash
# Step 2: Buyer initiates payment
curl -X POST http://localhost:4000/api/buyer/payment/initiate \
  -H "Authorization: Bearer {buyer_token}" \
  -d '{"orderId": 123}'
```

**Expected:** PayHere checkout URL returned
**Result:** [ ] Pass [ ] Fail

```bash
# Step 3: Complete payment on PayHere
# Use test card: 4111111111111111
```

**Expected:** Webhook received, status: AUTHORIZED
**Result:** [ ] Pass [ ] Fail

```bash
# Step 4: Transporter confirms delivery
curl -X POST http://localhost:4000/api/transporter/delivery/confirm \
  -H "Authorization: Bearer {transporter_token}" \
  -d '{"orderId": 123, "deliveryNotes": "Delivered successfully"}'
```

**Expected:** Status: DELIVERED
**Result:** [ ] Pass [ ] Fail

```bash
# Step 5: Transporter confirms quality
curl -X POST http://localhost:4000/api/transporter/delivery/quality-check \
  -H "Authorization: Bearer {transporter_token}" \
  -d '{
    "orderId": 123,
    "qualityScore": 4.5,
    "stockCondition": "EXCELLENT",
    "qualityNotes": "Fresh produce"
  }'
```

**Expected:** Payment captured, status: RELEASED
**Result:** [ ] Pass [ ] Fail

---

### Test Case 2: Order Cancellation (Refund)

```bash
# After payment authorized, cancel order
curl -X POST http://localhost:4000/api/buyer/payment/void \
  -H "Authorization: Bearer {admin_token}" \
  -d '{"orderId": 123, "reason": "Buyer cancelled"}'
```

**Expected:** Payment voided, status: REFUNDED
**Result:** [ ] Pass [ ] Fail

---

### Test Case 3: Payment Status Check

```bash
curl -X GET http://localhost:4000/api/buyer/payment/status/123 \
  -H "Authorization: Bearer {buyer_token}"
```

**Expected:** Current payment status returned
**Result:** [ ] Pass [ ] Fail

---

## 📊 Verification Checklist

### Database Checks

```sql
-- Check payment created
SELECT * FROM payments WHERE order_id = 123;
```

**Status:** [ ] Verified

```sql
-- Check quality record
SELECT * FROM quality_checks WHERE order_id = 123;
```

**Status:** [ ] Verified

```sql
-- Check order status
SELECT id, status, payment_status, total_amount
FROM placed_orders WHERE id = 123;
```

**Status:** [ ] Verified

---

### Blockchain Checks

```bash
# Query payment from blockchain
curl -X POST http://localhost:4000/api/blockchain/query \
  -d '{"contract": "PaymentContract", "function": "GetPayment", "args": ["ORDER_123"]}'
```

**Status:** [ ] Verified

---

### PayHere Dashboard Checks

- [ ] Transaction appears in dashboard
- [ ] Authorization status correct
- [ ] Capture/void recorded
- [ ] Amounts match

---

## 🔧 Troubleshooting

### Common Issues

#### Payment not authorized

- [ ] Check PAYHERE_MERCHANT_ID correct
- [ ] Verify PAYHERE_MERCHANT_SECRET correct
- [ ] Ensure `preapprove: "true"` in request
- [ ] Check hash calculation

#### Webhook not received

- [ ] Verify PAYHERE_NOTIFY_URL is publicly accessible
- [ ] Check ngrok is running (for local)
- [ ] Verify webhook in PayHere dashboard logs
- [ ] Check hash verification passed

#### Capture fails

- [ ] Ensure authorization_id is valid
- [ ] Verify PAYHERE_API_KEY is correct
- [ ] Check order status is DELIVERED
- [ ] Verify quality_confirmed_at is set

#### Database errors

- [ ] Run migration script
- [ ] Check foreign key constraints
- [ ] Verify user roles exist

---

## 🚨 Production Readiness

### Before going live:

- [ ] Update PayHere credentials to production
- [ ] Change PAYHERE_API_BASE to production URL
- [ ] Update callback URLs to production domain (HTTPS)
- [ ] Enable HTTPS for all endpoints
- [ ] Test with small real transaction
- [ ] Set up error monitoring
- [ ] Configure payment failure notifications
- [ ] Document refund policy
- [ ] Train support team on payment flow

### Security Checks:

- [ ] .env file in .gitignore
- [ ] API keys not in code
- [ ] Hash verification implemented
- [ ] Role-based access enforced
- [ ] HTTPS enabled
- [ ] Rate limiting configured

---

## 📈 Monitoring

### Metrics to track:

- [ ] Payment success rate
- [ ] Average authorization time
- [ ] Capture success rate
- [ ] Refund rate
- [ ] Webhook delivery rate

### Alerts to set up:

- [ ] Failed captures
- [ ] Failed webhooks
- [ ] Unusual refund rate
- [ ] Payment processing errors

---

## ✅ Final Sign-off

- [ ] All tests passed
- [ ] Documentation reviewed
- [ ] Team trained
- [ ] Production credentials ready
- [ ] Monitoring configured
- [ ] Ready for deployment

**Implemented by:** ************\_\_\_************
**Date:** ************\_\_\_************
**Approved by:** ************\_\_\_************
**Date:** ************\_\_\_************

---

## 📞 Support Contacts

**PayHere Support:**

- Email: support@payhere.lk
- Docs: https://support.payhere.lk

**Internal Team:**

- Backend Lead: ************\_\_\_************
- DevOps: ************\_\_\_************
- QA: ************\_\_\_************
