-- Migration: add PayHere Pay Later columns to placed_orders
-- Run once against your Supabase / PostgreSQL database.

ALTER TABLE placed_orders
  ADD COLUMN IF NOT EXISTS pay_method          TEXT    DEFAULT 'PAY_NOW',
  ADD COLUMN IF NOT EXISTS preapproval_status  TEXT,
  ADD COLUMN IF NOT EXISTS customer_token      TEXT,
  ADD COLUMN IF NOT EXISTS auto_charge_date    DATE,
  ADD COLUMN IF NOT EXISTS auto_charge_status  TEXT;

-- Optional: constrain the allowed values
-- ALTER TABLE placed_orders
--   ADD CONSTRAINT chk_pay_method CHECK (pay_method IN ('PAY_NOW', 'PAY_LATER')),
--   ADD CONSTRAINT chk_preapproval_status CHECK (preapproval_status IN ('PENDING', 'ACTIVE')),
--   ADD CONSTRAINT chk_auto_charge_status CHECK (auto_charge_status IN ('CHARGED', 'FAILED'));

-- Index to make the daily cron query fast
CREATE INDEX IF NOT EXISTS idx_placed_orders_auto_charge
  ON placed_orders (pay_method, preapproval_status, auto_charge_date, auto_charge_status);
