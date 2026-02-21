# PayHere Payment Integration - Preauthorization & Capture

## Overview

This payment system uses PayHere's **Preauthorization (Hold and Release)** feature to ensure secure transactions between buyers and farmers. The money is held by PayHere when the buyer pays, and only released to the farmer after the transporter confirms quality and delivery.

## Payment Flow

```
1. Buyer places order → Status: OPEN
2. Farmer accepts proposal → Status: AWAITING_PAYMENT
3. Buyer initiates payment → PayHere preauthorization
4. PayHere holds money → Status: AUTHORIZED (money held, not transferred)
5. Transporter arrives at farm → Inspects produce quality
6. Transporter confirms quality → Quality verified BEFORE pickup
7. Transporter picks up goods → Triggers payment release (Status: PICKED_UP)
8. Backend calls PayHere Capture API → Money released to farmer
9. Transporter delivers goods → Status: DELIVERED
10. Order complete → Status: COMPLETED, Payment: RELEASED
```

## PayHere API Features Used

### 1. **Preapproval (Preauthorization)**

- **Endpoint**: `POST https://www.payhere.lk/pay/checkout`
- **Parameter**: `preapprove: "true"`
- **What it does**: Authorizes the payment and holds the money without capturing it
- **Status**: Money is reserved on buyer's card but not transferred

### 2. **Capture API**

- **Endpoint**: `POST https://www.payhere.lk/merchant/v1/payment/capture`
- **What it does**: Releases the held money to the merchant (farmer)
- **When**: Called after transporter confirms quality
- **Required**: `authorization_token` from preauth response

### 3. **Void API**

- **Endpoint**: `POST https://www.payhere.lk/merchant/v1/payment/void`
- **What it does**: Cancels the authorization and releases the hold
- **When**: Order is cancelled before delivery
- **Required**: `authorization_token` from preauth response

## Environment Variables

Add these to your `.env` file:

```env
# PayHere Payment Gateway Configuration
PAYHERE_MERCHANT_ID=your_merchant_id
PAYHERE_MERCHANT_SECRET=your_merchant_secret
PAYHERE_API_KEY=your_api_key_for_capture_void

# Use sandbox for testing
PAYHERE_API_BASE=https://sandbox.payhere.lk

# Production
# PAYHERE_API_BASE=https://www.payhere.lk

# Callback URLs (must be publicly accessible for webhooks)
PAYHERE_RETURN_URL=https://yourdomain.com/api/buyer/payment/return
PAYHERE_CANCEL_URL=https://yourdomain.com/api/buyer/payment/cancel
PAYHERE_NOTIFY_URL=https://yourdomain.com/api/buyer/payment/notify
```

## API Endpoints

### Buyer Endpoints

#### 1. Initiate Payment (Preauthorization)

```http
POST /api/buyer/payment/initiate
Authorization: Bearer <buyer_token>

{
  "orderId": 123
}

Response:
{
  "message": "Payment authorization initiated successfully",
  "payment": {...},
  "paymentGatewayData": {...},
  "payhereEndpoint": "https://sandbox.payhere.lk/pay/checkout"
}
```

#### 2. Get Payment Status

```http
GET /api/buyer/payment/status/:orderId
Authorization: Bearer <buyer_token>

Response:
{
  "payment": {
    "status": "AUTHORIZED",
    "amount": 5000.00,
    "authorization_id": "abc123..."
  }
}
```

### Transporter Endpoints

#### 1. Confirm Quality & Pickup (Releases Payment)

```http
POST /api/transporter/pickup/confirm-quality-and-pickup
Authorization: Bearer <transporter_token>

{
  "orderId": 123,
  "qualityScore": 4.5,
  "qualityNotes": "Fresh produce, excellent condition",
  "stockCondition": "EXCELLENT",
  "pickupNotes": "Picked up from farmer's warehouse"
}

Response:
{
  "success": true,
  "message": "Quality confirmed, goods picked up, payment released to farmer",
  "captureId": "xyz789...",
  "pickedUpAt": "2026-02-13T09:15:00Z"
}
```

#### 2. Confirm Delivery

```http
POST /api/transporter/delivery/confirm
Authorization: Bearer <transporter_token>

{
  "orderId": 123,
  "deliveryNotes": "Delivered to buyer's warehouse",
  "receivedBy": "John Doe"
}

Response:
{
  "success": true,
  "message": "Delivery confirmed successfully",
  "deliveredAt": "2026-02-13T10:30:00Z"
}
```

### Admin Endpoints

#### Manual Capture (if auto-capture fails)

```http
POST /api/buyer/payment/capture
Authorization: Bearer <admin_token>

{
  "orderId": 123
}
```

#### Manual Void/Refund

```http
POST /api/buyer/payment/void
Authorization: Bearer <admin_token>

{
  "orderId": 123,
  "reason": "Order cancelled by buyer"
}
```

## Database Schema

### payments table

- `status`: PENDING → AUTHORIZED → PENDING_RELEASE → RELEASED
- `authorization_id`: PayHere preauth token
- `capture_id`: PayHere capture transaction ID
- `quality_confirmed_by`: Transporter who confirmed quality
- `quality_confirmed_at`: When quality was confirmed

### quality_checks table

- `quality_score`: Numeric rating (0-5)
- `quality_notes`: Transporter's comments
- `stock_condition`: EXCELLENT, GOOD, ACCEPTABLE, POOR

## Blockchain Integration

### PaymentContract Functions

1. **InitiatePayment**: Records payment initiation
2. **AuthorizePayment**: Records money held by PayHere
3. **ReleasePayment**: Transporter triggers release
4. **ConfirmPaymentRelease**: Backend confirms capture success
5. **RefundPayment**: Marks for refund
6. **ConfirmRefund**: Backend confirms void success

## Testing

### Sandbox Testing

1. Use PayHere sandbox credentials
2. Test card numbers:
   - Success: `4111111111111111`
   - Declined: `4000000000000002`

### Test Flow

```bash
# 1. Farmer accepts proposal
curl -X POST http://localhost:4000/api/farmer/proposals/1/accept \
  -H "Authorization: Bearer <farmer_token>"

# 2. Buyer initiates payment
curl -X POST http://localhost:4000/api/buyer/payment/initiate \
  -H "Authorization: Bearer <buyer_token>" \
  -d '{"orderId": 123}'
quality and picks up goods (releases payment to farmer)
curl -X POST http://localhost:4000/api/transporter/pickup/confirm-quality-and-pickup \
  -H "Authorization: Bearer <transporter_token>" \
  -d '{
    "orderId": 123,
    "qualityScore": 4.5,
    "stockCondition": "EXCELLENT",
    "qualityNotes": "Fresh produce, good condition",
    "pickupNotes": "Picked up from farm"
  }'

# 5. Transporter confirms delivery to buyer
curl -X POST http://localhost:4000/api/transporter/delivery/confirm \
  -H "Authorization: Bearer <transporter_token>" \
  -d '{"orderId": 123, "deliveryNotes": "Delivered to warehouse A"  "orderId": 123,
    "qualityScore": 4.5,
    "stockCondition": "EXCELLENT"
  }'
```

## Security Considerations

1. **Hash Verification**: All PayHere notifications are verified using MD5 hash
2. **Internal Routes**: Capture endpoint has internal-only protection
3. **Role-based Access**: Each endpoint requires appropriate role
4. **HTTPS Required**: Webhook URLs must use HTTPS in production

## Common Issues

### Payment not authorized

- Check PayHere credentials
- Verify `preapprove: "true"` is set
- Check hash calculation

### Capture fails

- Ensure authorization_id is valid
- Check PayHere API key is correct
- Verify order status is DELIVERED
- Check quality confirmation was recorded

### Webhook not received

- Ensure NOTIFY_URL is publicly accessible
- Use ngrok for local testing
- Check PayHere dashboard for webhook logs

## Production Checklist

- [ ] Update PayHere credentials to production
- [ ] Change PAYHERE_API_BASE to production URL
- [ ] Update callback URLs to production domain
- [ ] Enable HTTPS for all webhook URLs
- [ ] Test preauthorization flow
- [ ] Test capture flow
- [ ] Test void/refund flow
- [ ] Set up monitoring for failed captures
- [ ] Configure payment failure notifications

## Support

For PayHere API documentation:

- https://support.payhere.lk/api-&-integration/payhere-preapproval
- https://support.payhere.lk/api-&-integration/payhere-payment-capture-api
- https://support.payhere.lk/api-&-integration/payhere-void-api
