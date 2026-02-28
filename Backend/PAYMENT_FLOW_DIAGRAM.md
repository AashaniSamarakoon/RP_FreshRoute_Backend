# PayHere Payment Flow Diagram

## Visual Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PAYMENT LIFECYCLE                                    │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────┐     ┌─────────┐     ┌────────────┐     ┌─────────┐
│  Buyer  │     │ Farmer  │     │ Transporter│     │ PayHere │
└────┬────┘     └────┬────┘     └─────┬──────┘     └────┬────┘
     │               │                 │                 │
     │  1. Place     │                 │                 │
     │  Order        │                 │                 │
     ├──────────────>│                 │                 │
     │               │                 │                 │
     │               │ 2. Accept       │                 │
     │               │ Proposal        │                 │
     │<──────────────┤                 │                 │
     │  "AWAITING    │                 │                 │
     │   PAYMENT"    │                 │                 │
     │               │                 │                 │
     │ 3. Initiate   │                 │                 │
     │ Payment       │                 │                 │
     ├───────────────┼─────────────────┼────────────────>│
     │               │                 │                 │
     │               │                 │  4. Preauthorize│
     │               │                 │  (Hold Money)   │
     │<──────────────┼─────────────────┼─────────────────┤
     │  Redirect to  │                 │                 │
     │  PayHere      │                 │                 │
     │               │                 │                 │
     │ 5. Complete   │                 │                 │
     │ Payment       │                 │                 │
     ├───────────────┼─────────────────┼────────────────>│
     │               │                 │                 │
     │               │                 │  💰 MONEY HELD  │
     │               │                 │  (NOT SENT YET) │
     │<──────────────┼─────────────────┼─────────────────┤
     │  "AUTHORIZED" │                 │                 │
     │               │                 │                 │
     │               │ 6. Prepare      │                 │
     │               │ Shipment        │                 │
     │               ├────────────────>│                 │
     │               │                 │                 │
     │               │                 │ 7. Pickup &     │
     │               │                 │ Transport       │
     │               │                 │ [IN_TRANSIT]    │
     │               │                 │                 │
     │               │                 │ 8. Deliver      │
     │<──────────────┼─────────────────┤                 │
     │  Delivered    │                 │ [DELIVERED]     │
     │               │                 │                 │
     │               │                 │ 9. Quality Check│
     │               │                 │ & Confirm       │
     │               │                 ├────────────────>│
     │               │                 │ Capture Request │
     │               │                 │                 │
     │               │                 │  💸 MONEY       │
     │               │<────────────────┼─────────────────┤
     │               │  RELEASED!      │  TRANSFERRED    │
     │               │  [COMPLETED]    │                 │
     │               │                 │                 │
     ▼               ▼                 ▼                 ▼


═══════════════════════════════════════════════════════════════════════════
                         STATUS TRANSITIONS
═══════════════════════════════════════════════════════════════════════════

Order Status Flow:
──────────────────
OPEN → PENDING_FARMER → AWAITING_PAYMENT → PAID_PENDING_DELIVERY
→ IN_TRANSIT → DELIVERED → COMPLETED


Payment Status Flow:
────────────────────
PENDING → AUTHORIZED → PENDING_RELEASE → RELEASED


═══════════════════════════════════════════════════════════════════════════
                      KEY PAYMENT MOMENTS
═══════════════════════════════════════════════════════════════════════════

1️⃣  PREAUTHORIZATION (Buyer pays)
    • Money is reserved on buyer's card
    • PayHere holds the funds
    • Farmer cannot access money yet
    • Status: AUTHORIZED

2️⃣  QUALITY CONFIRMATION (Transporter checks)
    • Transporter verifies produce quality
    • Records quality score and condition
    • Triggers payment release
    • Status: PENDING_RELEASE

3️⃣  CAPTURE (Money released)
    • Backend calls PayHere Capture API
    • Money transferred to farmer's account
    • Transaction complete
    • Status: RELEASED


═══════════════════════════════════════════════════════════════════════════
                        REFUND SCENARIO
═══════════════════════════════════════════════════════════════════════════

Order Cancelled Before Delivery:
─────────────────────────────────

┌─────────┐                                   ┌─────────┐
│  Buyer  │                                   │ PayHere │
└────┬────┘                                   └────┬────┘
     │                                             │
     │  Payment Authorized                        │
     │  💰 Money Held                             │
     │                                             │
     │  ❌ Order Cancelled                        │
     │  (Before Delivery)                         │
     ├────────────────────────────────────────────>│
     │  Void Request                               │
     │                                             │
     │                                  🔄 Release │
     │<────────────────────────────────────────────┤
     │  Money Returned to Card                     │
     │  Status: REFUNDED                           │
     ▼                                             ▼


═══════════════════════════════════════════════════════════════════════════
                    BLOCKCHAIN INTEGRATION
═══════════════════════════════════════════════════════════════════════════

Ledger Records:
───────────────
1. InitiatePayment()      → Payment started
2. AuthorizePayment()     → Money held by PayHere
3. ReleasePayment()       → Transporter confirms quality
4. ConfirmPaymentRelease()→ Money transferred to farmer
5. RefundPayment()        → Cancellation requested
6. ConfirmRefund()        → Money returned to buyer

Benefits:
─────────
✅ Immutable record of all payment events
✅ Transparent audit trail
✅ Dispute resolution evidence
✅ Farmer confidence (payment guaranteed)
✅ Buyer protection (quality verified)


═══════════════════════════════════════════════════════════════════════════
                         API SEQUENCE
═══════════════════════════════════════════════════════════════════════════

Backend → PayHere Interactions:
────────────────────────────────

1. Buyer Checkout:
   POST /pay/checkout
   Body: {preapprove: "true", ...}
   → Returns: authorization_token

2. PayHere Webhook:
   POST /api/buyer/payment/notify
   → Confirms: Money authorized

3. Quality Check:
   POST /api/transporter/delivery/quality-check
   → Triggers: Capture process

4. Capture Payment:
   POST /merchant/v1/payment/capture
   Body: {authorization_token: "..."}
   → Returns: capture_id, money released

5. Void/Refund:
   POST /merchant/v1/payment/void
   Body: {authorization_token: "..."}
   → Returns: void_id, money refunded


═══════════════════════════════════════════════════════════════════════════
                    DATABASE STATE TRACKING
═══════════════════════════════════════════════════════════════════════════

payments table:
───────────────
{
  "status": "AUTHORIZED",
  "authorization_id": "xyz123",      // PayHere preauth token
  "authorized_at": "2026-02-08...",
  "quality_confirmed_by": 456,       // Transporter ID
  "quality_confirmed_at": null,      // Filled after quality check
  "capture_id": null,                // Filled after capture
  "released_at": null                // Filled after capture
}

quality_checks table:
─────────────────────
{
  "order_id": 123,
  "transporter_id": 456,
  "quality_score": 4.5,
  "stock_condition": "EXCELLENT",
  "checked_at": "2026-02-08..."
}


═══════════════════════════════════════════════════════════════════════════
```

## Summary

**What PayHere Does:**

- ✅ Holds buyer's money securely (Preauthorization)
- ✅ Releases to farmer only after confirmation (Capture)
- ✅ Returns to buyer if cancelled (Void)

**What Transporter Does:**

- ✅ Confirms delivery
- ✅ Verifies produce quality
- ✅ Triggers payment release

**What Blockchain Does:**

- ✅ Records all payment events immutably
- ✅ Provides audit trail
- ✅ Ensures transparency
