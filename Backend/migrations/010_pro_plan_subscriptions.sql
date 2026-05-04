-- 010_pro_plan_subscriptions.sql
-- Adds minimal tables to support a Pro plan subscription without impacting existing order payments.

-- Stores the user's current (or historical) subscription periods.
CREATE TABLE IF NOT EXISTS user_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  plan text NOT NULL CHECK (plan IN ('free','pro')),
  status text NOT NULL CHECK (status IN ('ACTIVE','EXPIRED','CANCELLED','PENDING')),
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  provider text DEFAULT 'payhere',
  provider_payment_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_id ON user_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_status ON user_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_expires_at ON user_subscriptions(expires_at);
