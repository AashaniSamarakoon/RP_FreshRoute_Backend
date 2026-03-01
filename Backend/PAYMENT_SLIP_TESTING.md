# Payment Slip Verification System - Testing Guide

## Database Setup

1. Run database migrations:

```sql
-- In Supabase SQL editor or psql
\i Backend/scripts/add_payment_slip_columns.sql
\i Backend/scripts/create_payment_slip_audit_tables.sql
```

2. Create Supabase storage bucket:

- Go to Supabase Dashboard → Storage
- Create new bucket: `payment-slips`
- Set to **Public** (for admin review access)

## Testing Flow

### 1. Buyer Upload Payment Slip

**Endpoint:** `POST /api/buyer/payment-slip/upload`

**Prerequisites:**

- Buyer must be logged in (JWT token)
- Order must exist with status `AWAITING_PAYMENT`

**Test with cURL:**

```bash
# Replace TOKEN with buyer JWT token
# Replace ORDER_ID with actual order ID
# Replace image.jpg with actual payment slip image

curl -X POST http://localhost:4000/api/buyer/payment-slip/upload \
  -H "Authorization: Bearer YOUR_BUYER_JWT_TOKEN" \
  -F "orderId=123" \
  -F "paymentSlip=@test-payment-slip.jpg"
```

**Test with Postman:**

1. Method: POST
2. URL: `http://localhost:4000/api/buyer/payment-slip/upload`
3. Headers:
   - `Authorization`: `Bearer YOUR_BUYER_JWT_TOKEN`
4. Body (form-data):
   - `orderId`: `123`
   - `paymentSlip`: Select file

**Expected Response (Auto-Approved):**

```json
{
  "message": "Payment slip verified and approved automatically",
  "paymentId": "uuid-here",
  "verificationStatus": "AUTO_APPROVED",
  "ocrData": {
    "rawText": "...",
    "confidence": 96,
    "amount": 1000.0,
    "date": "2026-02-15",
    "reference": "TXN123456",
    "bank": "Commercial Bank"
  },
  "requiresManualReview": false,
  "slipUrl": "https://...supabase.co/storage/v1/object/public/payment-slips/..."
}
```

**Expected Response (Flagged for Review):**

```json
{
  "message": "Payment slip uploaded successfully. Pending manual verification.",
  "verificationStatus": "FLAGGED",
  "requiresManualReview": true
}
```

**Expected Response (Rejected):**

```json
{
  "message": "Payment slip verification failed. Please upload a clear image with visible amount and date.",
  "verificationStatus": "REJECTED"
}
```

### 2. Check Payment Slip Status

**Endpoint:** `GET /api/buyer/payment-slip/status/:orderId`

```bash
curl -X GET http://localhost:4000/api/buyer/payment-slip/status/123 \
  -H "Authorization: Bearer YOUR_BUYER_JWT_TOKEN"
```

**Expected Response:**

```json
{
  "orderId": 123,
  "amount": 1000.00,
  "verificationStatus": "FLAGGED",
  "uploadedAt": "2026-02-15T10:30:00Z",
  "verifiedAt": null,
  "notes": "Flagged for review: Confidence 85%, amount match 97.5%",
  "ocrData": { ... },
  "slipUrl": "https://..."
}
```

### 3. Admin: View Pending Slips

**Endpoint:** `GET /api/admin/payment-slips/pending`

**Prerequisites:**

- Admin must be logged in

```bash
curl -X GET "http://localhost:4000/api/admin/payment-slips/pending?page=1&limit=20&status=FLAGGED" \
  -H "Authorization: Bearer YOUR_ADMIN_JWT_TOKEN"
```

**Expected Response:**

```json
{
  "payments": [
    {
      "id": "payment-uuid",
      "order_id": 123,
      "buyer_id": 1,
      "amount": 1000.00,
      "payment_slip_url": "https://...",
      "slip_uploaded_at": "2026-02-15T10:30:00Z",
      "slip_ocr_data": { ... },
      "slip_verification_status": "FLAGGED",
      "users": {
        "user_metadata": {
          "name": "John Doe"
        }
      },
      "placed_orders": {
        "id": 123,
        "total_amount": 1000.00
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 5,
    "totalPages": 1
  }
}
```

### 4. Admin: Approve Payment Slip

**Endpoint:** `POST /api/admin/payment-slips/:paymentId/approve`

```bash
curl -X POST http://localhost:4000/api/admin/payment-slips/PAYMENT_UUID/approve \
  -H "Authorization: Bearer YOUR_ADMIN_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"notes": "Payment verified with bank. Amount confirmed."}'
```

**Expected Response:**

```json
{
  "message": "Payment slip approved successfully",
  "payment": {
    "id": "payment-uuid",
    "slip_verification_status": "APPROVED",
    "status": "AUTHORIZED",
    "slip_verified_at": "2026-02-15T11:00:00Z"
  }
}
```

**Side Effects:**

- Order status updated to `PAID_PENDING_DELIVERY`
- Buyer receives notification
- Audit log created

### 5. Admin: Reject Payment Slip

**Endpoint:** `POST /api/admin/payment-slips/:paymentId/reject`

```bash
curl -X POST http://localhost:4000/api/admin/payment-slips/PAYMENT_UUID/reject \
  -H "Authorization: Bearer YOUR_ADMIN_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason": "Image too blurry. Cannot verify amount or date."}'
```

**Expected Response:**

```json
{
  "message": "Payment slip rejected",
  "payment": {
    "slip_verification_status": "REJECTED",
    "status": "FAILED"
  }
}
```

**Side Effects:**

- Buyer rejection count incremented
- Buyer receives notification
- Fraud score updated (if multiple rejections)

### 6. Admin: View Statistics

**Endpoint:** `GET /api/admin/payment-slips/stats`

```bash
curl -X GET http://localhost:4000/api/admin/payment-slips/stats \
  -H "Authorization: Bearer YOUR_ADMIN_JWT_TOKEN"
```

**Expected Response:**

```json
{
  "stats": {
    "total": 150,
    "pending": 5,
    "flagged": 12,
    "approved": 80,
    "auto_approved": 45,
    "rejected": 8,
    "total_amount": 1250000.0,
    "avg_verification_time_hours": 2.5
  }
}
```

### 7. Admin: View Fraud Alerts

**Endpoint:** `GET /api/admin/payment-slips/fraud-alerts`

```bash
curl -X GET http://localhost:4000/api/admin/payment-slips/fraud-alerts \
  -H "Authorization: Bearer YOUR_ADMIN_JWT_TOKEN"
```

**Expected Response:**

```json
{
  "alerts": [
    {
      "buyerId": 42,
      "buyerName": "Suspicious User",
      "count": 5,
      "rejections": [
        {
          "paymentId": "uuid1",
          "orderId": 100,
          "uploadedAt": "2026-02-10T08:00:00Z"
        }
      ]
    }
  ],
  "highRiskCount": 1,
  "totalRejected": 8
}
```

## Edge Case Testing

### Test Case 1: Duplicate Slip Upload

1. Upload slip for Order #1 → Success
2. Try uploading same image for Order #2
3. **Expected:** Rejected with "This payment slip has already been uploaded"

### Test Case 2: Blocked Buyer

1. Reject 5 slips from same buyer
2. Buyer tries to upload new slip
3. **Expected:** 403 error "Your account is blocked from uploading payment slips"

### Test Case 3: Wrong Order Status

1. Try uploading slip for order with status `COMPLETED`
2. **Expected:** 400 error "Cannot upload slip for order with status: COMPLETED"

### Test Case 4: Large File

1. Upload image > 5MB
2. **Expected:** Multer error "File too large"

### Test Case 5: Non-Image File

1. Upload PDF or TXT file
2. **Expected:** Multer error "Only image files are allowed"

### Test Case 6: OCR Failure

1. Upload blank/white image
2. **Expected:** Rejected with "Low confidence" or auto-flagged

### Test Case 7: Amount Mismatch

1. Order amount: LKR 1000.00
2. Upload slip showing LKR 2000.00
3. **Expected:** Flagged or rejected based on % mismatch

### Test Case 8: Old Date

1. Upload slip with date > 7 days ago
2. **Expected:** Flagged or rejected

## Sample Test Images

Create test images with following content:

**High Quality (Should Auto-Approve):**

```
Commercial Bank of Ceylon
Payment Receipt

Date: 2026-02-15
Amount: LKR 1,000.00
Reference: TXN987654321

From: John Doe
To: FreshRoute Account
```

**Low Quality (Should Flag):**

- Blurry image
- Handwritten slip
- Poor lighting
- Partial text visible

**Fraudulent (Should Reject/Flag):**

- Amount: LKR 500.00 (when order is LKR 1000)
- Date: 2026-01-01 (>7 days old)
- No amount visible
- Edited/manipulated image

## Monitoring & Logs

Watch backend console for:

```
[AUDIT] Payment {uuid} approved by admin {adminId} for order {orderId}
[FRAUD] Buyer {buyerId} blocked by admin {adminId}. Reason: Multiple fraudulent slips
```

Check audit trail in database:

```sql
SELECT * FROM payment_slip_audit_log
WHERE payment_id = 'uuid-here'
ORDER BY created_at;
```

Check fraud scores:

```sql
SELECT * FROM buyer_fraud_scores
WHERE risk_level IN ('MEDIUM', 'HIGH')
ORDER BY rejection_count DESC;
```

## Common Issues

### Issue: "Cannot find module 'tesseract.js'"

**Solution:** `npm install tesseract.js sharp multer`

### Issue: "Supabase storage upload failed"

**Solution:** Check bucket exists and is public

### Issue: "Missing token"

**Solution:** Ensure Authorization header with valid JWT

### Issue: OCR returns null for amount

**Solution:** Image quality too low or wrong format. Try clearer image with larger text

### Issue: Auto-approve not working

**Solution:** Check OCR confidence >= 95%, amount match >= 98%, date within 7 days

## Success Criteria

✅ Buyer can upload payment slip
✅ OCR extracts amount, date, reference
✅ High-quality slips auto-approved
✅ Low-quality slips flagged for review
✅ Admin can approve/reject slips
✅ Buyer receives notifications
✅ Duplicate slips detected
✅ Fraud score calculated
✅ Blocked buyers cannot upload
✅ Audit trail logged
✅ Statistics displayed

## Next Steps

After testing, you may want to:

1. Improve OCR accuracy with Google Vision API (paid)
2. Add bank API integration for real-time verification
3. Create admin dashboard UI
4. Add blockchain logging for approved payments
5. Implement dispute resolution workflow
6. Add email notifications alongside in-app notifications
7. Create buyer education materials on taking good slip photos
