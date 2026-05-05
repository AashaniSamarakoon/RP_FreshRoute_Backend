# Pro Plan — Personal Market Forecast API (Backend)

This document describes the backend API for the **Pro feature: Personal Market Forecast**.

## What this feature does

- Uses the farmer’s registered crops (`farmers.primary_crops`) to build a **personal forecast**.
- Combines:
  - Forecast table data (`forecasts`) and
  - Live market prices (`economic_center_prices`) for today (optionally filtered by farmer location)
- Returns **chart-ready series** + **personal hints**.
- Enforces **Pro plan gating**: non‑pro users receive a `402` with `code=PRO_REQUIRED`.

## Data model (Supabase)

Apply migration: `Backend/migrations/010_pro_plan_subscriptions.sql`

Tables added:
- `user_subscriptions`

Optional (audit only):
- `pro_subscription_orders` (apply `Backend/migrations/012_add_pro_subscription_orders_optional.sql`)

Notes:
- Older versions used a `pro_subscription_orders` table to track pending payments.
- Current version does **not** require it; PayHere `order_id` encodes the user id.
  - If you still want audit tracking, apply `012_add_pro_subscription_orders_optional.sql`.

## Endpoints

### 1) Get Pro status

`GET /api/pro/status`

Auth: Bearer token

Response:
```json
{
  "isPro": false,
  "plan": "free",
  "subscription": null
}
```

### 2) Start Pro subscription payment (PayHere)

`POST /api/pro/subscribe/init`

Auth: Bearer token

Body (optional):
```json
{
  "amount": 1490,
  "currency": "LKR",
  "durationDays": 30,
  "address": "optional override",
  "city": "optional override",
  "country": "Sri Lanka"
}
```

Response (PayHere payment object — returned directly):
```json
{
  "merchant_id": "xxxx",
  "order_id": "PRO_<userId>_<uuid>",
  "items": "FreshRoute Pro Plan",
  "amount": "1490.00",
  "currency": "LKR",
  "hash": "<payhere_hash>",
  "notify_url": "https://<your-public-host>/api/pro/payhere/notify",
  "first_name": "...",
  "last_name": "...",
  "email": "...",
  "phone": "...",
  "address": "...",
  "city": "...",
  "country": "Sri Lanka"
}
```

Notes:
- Configure PayHere payment to use notify URL: `/api/pro/payhere/notify`
- Required env vars: `PAYHERE_MERCHANT_ID`, `PAYHERE_MERCHANT_SECRET`
- Recommended: `PUBLIC_BASE_URL` so `notify_url` is absolute (e.g. `https://api.yourdomain.com`)

Validation:
- If user profile is missing `first_name`, `last_name`, `email`, or `phone`, backend returns `400`.

### 3) PayHere notify for Pro purchases

`POST /api/pro/payhere/notify`

No auth. `application/x-www-form-urlencoded` payload from PayHere.

- Validates `md5sig`
- Extracts `userId` from `order_id` format `PRO_<userId>_<uuid>`
- On success, creates/extends a `user_subscriptions` row (plan `pro`)

Always returns: `200 OK` with body `OK`.

### 4) Personal Market Forecast (Pro feature)

`GET /api/pro/personal-market-forecast?days=14&target=price&location=Dambulla`

Auth: Bearer token (role: `farmer`)

- Requires Pro plan (`402 PRO_REQUIRED` otherwise)

Response includes:
- `series[]` with `{ fruit, liveToday, points[] }`
- Each point has `date`, `forecast`, `liveToday`, `combined`, `trend`
- `hints[]` per fruit

## Pro gating behavior

If user is not Pro:

Status: `402`
```json
{
  "code": "PRO_REQUIRED",
  "message": "Pro plan required to access this feature",
  "action": { "type": "upgrade", "endpoint": "/api/pro/subscribe/init" }
}
```

## Environment variables

- `PAYHERE_MERCHANT_ID`
- `PAYHERE_MERCHANT_SECRET`
- `PRO_PLAN_PRICE_LKR` (default: `1490`)
- `PRO_PLAN_DURATION_DAYS` (default: `30`)
