-- Add blockchain_tx_id column to key tables so ledger transactions can be traced
-- Execute this in Supabase SQL Editor or as part of your migration process.

ALTER TABLE placed_orders
ADD COLUMN IF NOT EXISTS blockchain_tx_id TEXT;

ALTER TABLE match_proposals
ADD COLUMN IF NOT EXISTS blockchain_tx_id TEXT;

ALTER TABLE payments
ADD COLUMN IF NOT EXISTS blockchain_tx_id TEXT;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS blockchain_tx_id TEXT;

-- Optionally add comments for clarity
COMMENT ON COLUMN placed_orders.blockchain_tx_id IS 'Transaction ID for ledger actions related to this order';
COMMENT ON COLUMN match_proposals.blockchain_tx_id IS 'Ledger tx id for proposal operations (acceptance etc.)';
COMMENT ON COLUMN payments.blockchain_tx_id IS 'Ledger tx id for payment lifecycle actions (release, refund)';
COMMENT ON COLUMN users.blockchain_tx_id IS 'Ledger tx id for user registration on the blockchain';
