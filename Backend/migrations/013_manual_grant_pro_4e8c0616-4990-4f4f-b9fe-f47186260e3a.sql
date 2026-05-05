-- 013_manual_grant_pro_4e8c0616-4990-4f4f-b9fe-f47186260e3a.sql
-- Manual Pro grant for a specific user.
-- Run in Supabase SQL editor.

BEGIN;

-- 1) Create/extend Pro subscription safely:
--    expires_at = max(now(), latest ACTIVE pro expires_at) + 30 days
WITH base AS (
  SELECT
    GREATEST(
      now(),
      COALESCE(
        (
          SELECT MAX(expires_at)
          FROM user_subscriptions
          WHERE user_id = '4e8c0616-4990-4f4f-b9fe-f47186260e3a'
            AND plan = 'pro'
            AND status = 'ACTIVE'
        ),
        now()
      )
    ) AS base_time
)
INSERT INTO user_subscriptions (
  user_id,
  plan,
  status,
  started_at,
  expires_at,
  provider,
  provider_payment_id,
  created_at,
  updated_at
)
SELECT
  '4e8c0616-4990-4f4f-b9fe-f47186260e3a'::uuid,
  'pro',
  'ACTIVE',
  now(),
  (base.base_time + interval '30 days'),
  'manual',
  'MANUAL_GRANT_2026-05-01',
  now(),
  now()
FROM base;

-- 2) OPTIONAL: write an audit row if pro_subscription_orders exists
DO $$
BEGIN
  INSERT INTO pro_subscription_orders (
    id,
    user_id,
    amount,
    currency,
    status,
    provider,
    provider_payment_id,
    created_at,
    updated_at
  ) VALUES (
    'PRO_4e8c0616-4990-4f4f-b9fe-f47186260e3a_MANUAL_2026-05-01',
    '4e8c0616-4990-4f4f-b9fe-f47186260e3a'::uuid,
    0,
    'LKR',
    'PAID',
    'manual',
    'MANUAL_GRANT_2026-05-01',
    now(),
    now()
  )
  ON CONFLICT (id) DO NOTHING;
EXCEPTION
  WHEN undefined_table THEN
    -- Ignore if the audit table wasn't created
    NULL;
END $$;

COMMIT;
