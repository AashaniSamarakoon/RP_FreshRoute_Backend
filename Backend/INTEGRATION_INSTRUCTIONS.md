# Backend Integration Instructions

## 1. Add to package.json dependencies

The `axios` and `crypto` packages are needed. Run:

```bash
npm install axios
```

Note: `crypto` is built into Node.js, no installation needed.

## 2. Add routes to index.js

Add these route imports near the top with other route imports:

```javascript
// Payment routes
const paymentRoutes = require("./routes/buyer/paymentRoutes");

// Delivery routes
const deliveryRoutes = require("./routes/transporter/deliveryRoutes");
```

Then register the routes with the app:

```javascript
// Payment endpoints
app.use("/api/buyer/payment", paymentRoutes);

// Transporter delivery endpoints
app.use("/api/transporter/delivery", deliveryRoutes);
```

## 3. Update .env file

Add these PayHere configuration variables:

```env
# PayHere Payment Gateway Configuration (Add to your .env)
PAYHERE_MERCHANT_ID=your_merchant_id_here
PAYHERE_MERCHANT_SECRET=your_merchant_secret_here
PAYHERE_API_KEY=your_api_key_here

# Use sandbox for testing, production for live
PAYHERE_API_BASE=https://sandbox.payhere.lk
# PAYHERE_API_BASE=https://www.payhere.lk

# Callback URLs (update with your domain)
PAYHERE_RETURN_URL=http://localhost:4000/api/buyer/payment/return
PAYHERE_CANCEL_URL=http://localhost:4000/api/buyer/payment/cancel
PAYHERE_NOTIFY_URL=https://your-ngrok-or-domain.com/api/buyer/payment/notify
```

## 4. Run database migration

Execute the SQL migration to create required tables:

```bash
# Option 1: Direct SQL execution
psql -h db.aiwndjgadyaxuyoioxxa.supabase.co -U postgres -d postgres -f Backend/scripts/create_payments_table.sql

# Option 2: Copy and paste the SQL into Supabase SQL Editor
```

## 5. Update blockchain chaincode

The PaymentContract.ts has been uncommented and updated. You need to:

1. Navigate to the chaincode directory:

```bash
cd Blockchain/asset-transfer-basic/chaincode-typescript
```

2. Rebuild and redeploy the chaincode:

```bash
npm install
npm run build

# Then follow your usual chaincode deployment process
cd ../../../test-network
./network.sh deployCC -ccn freshroute -ccp ../asset-transfer-basic/chaincode-typescript -ccl typescript
```

## 6. Test the integration

Follow the testing steps in `PAYHERE_PAYMENT_INTEGRATION.md`

## Complete Flow Summary

### Order Lifecycle with Payment:

1. **Buyer places order** → Status: `OPEN`
2. **System runs matching** → Creates proposals
3. **Buyer approves proposal** → Status: `PENDING_FARMER`
4. **Farmer accepts proposal** → Status: `AWAITING_PAYMENT`
5. **Buyer initiates payment** → Redirected to PayHere
6. **PayHere authorizes payment** → Status: `AUTHORIZED_PAYMENT`, Money held

### Farmer App Status Updates
After payment authorization, farmers can update the order lifecycle via three endpoints:

* `GET /api/farmer/orders` — fetch orders assigned to the farmer (starts at `MATCHED` and includes all later states; each order now includes pricing breakdown and product images)
* `GET /api/farmer/orders/:orderId` — fetch a single order's details by ID (farmer must be assigned to the order; includes pricing/images)
* `PATCH /api/farmer/orders/:orderId/ready`  — move `AUTHORIZED_PAYMENT` → `READY_FOR_PICKUP` (formerly required PACKING; still accepted for older clients)
* `PATCH /api/farmer/orders/:orderId/packing` — **deprecated alias** for the ready endpoint
These endpoints require the caller to be the selected farmer.  Each call also
sends a system notification to the buyer so they are informed of progress.
7. **Transporter assigned** → Picks up goods
8. **Transporter delivers** → Status: `DELIVERED`
9. **Transporter confirms quality** → Triggers payment capture
10. **PayHere releases money** → Status: `COMPLETED`, Money sent to farmer

### Payment Statuses:

- `PENDING` - Payment initiated, waiting for buyer
- `AUTHORIZED` - Money held by PayHere (not transferred)
- `PENDING_RELEASE` - Quality confirmed, capture in progress
- `RELEASED` - Money sent to farmer
- `PENDING_REFUND` - Refund requested
- `REFUNDED` - Money returned to buyer
- `FAILED` - Payment failed

## Files Created/Modified

### New Files:

1. `Backend/controllers/buyer/paymentController.js` - Payment logic with PayHere API
2. `Backend/controllers/transporter/deliveryController.js` - Delivery and quality confirmation
3. `Backend/routes/buyer/paymentRoutes.js` - Payment endpoints
4. `Backend/routes/transporter/deliveryRoutes.js` - Delivery endpoints
5. `Backend/scripts/create_payments_table.sql` - Database schema
6. `Backend/PAYHERE_PAYMENT_INTEGRATION.md` - Complete documentation
7. `Blockchain/asset-transfer-basic/chaincode-typescript/src/contracts/PaymentContract.ts` - Updated

### Modified Files:

1. `Backend/controllers/farmer/proposalController.js` - Updated acceptProposal to set AWAITING_PAYMENT status

## Next Steps

1. ✅ Add routes to index.js
2. ✅ Update .env with PayHere credentials
3. ✅ Run database migration
4. ✅ Redeploy blockchain chaincode
5. ✅ Test payment flow
6. ✅ Configure ngrok for webhook testing (for local dev)
7. ✅ Update to production credentials when ready

## Ngrok Setup (for local webhook testing)

```bash
# Install ngrok
# Start ngrok tunnel
ngrok http 4000

# Copy the https URL and update .env
PAYHERE_NOTIFY_URL=https://your-ngrok-url.ngrok.io/api/buyer/payment/notify
```

## Important Notes

⚠️ **Security**: Never commit PayHere credentials to git
⚠️ **Testing**: Use sandbox environment before production
⚠️ **Webhooks**: PayHere notify URL must be publicly accessible
⚠️ **HTTPS**: Production webhooks require HTTPS
