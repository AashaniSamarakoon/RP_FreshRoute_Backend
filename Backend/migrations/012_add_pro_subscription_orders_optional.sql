-- 012_add_pro_subscription_orders_optional.sql
-- OPTIONAL: Add a lightweight audit table for Pro subscription payment attempts.
-- The Pro flow does not require this table; controllers write to it best-effort.

CREATE TABLE IF NOT EXISTS pro_subscription_orders (
  id text PRIMARY KEY, -- PayHere order_id
  user_id uuid NOT NULL,
  amount numeric(12,2) NOT NULL,
  currency text NOT NULL DEFAULT 'LKR',
  status text NOT NULL CHECK (status IN ('PENDING','PAID','FAILED','CANCELLED')) DEFAULT 'PENDING',
  provider text NOT NULL DEFAULT 'payhere',
  provider_payment_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pro_subscription_orders_user_id ON pro_subscription_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_pro_subscription_orders_status ON pro_subscription_orders(status);
