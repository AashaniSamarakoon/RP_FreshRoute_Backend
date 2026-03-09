-- Add blockchain_tx_id column to key tables so ledger transactions can be traced
-- Execute this in Supabase SQL Editor or as part of your migration process.

-- create or convert blockchain_tx_id columns as text arrays
ALTER TABLE placed_orders
ADD COLUMN IF NOT EXISTS blockchain_tx_id TEXT[];

-- convert existing plain text column into array if necessary
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='placed_orders' AND column_name='blockchain_tx_id' AND data_type='text'
  ) THEN
    ALTER TABLE placed_orders
      ALTER COLUMN blockchain_tx_id TYPE TEXT[] USING ARRAY[blockchain_tx_id];
  END IF;
END$$;

ALTER TABLE match_proposals
ADD COLUMN IF NOT EXISTS blockchain_tx_id TEXT[];
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='match_proposals' AND column_name='blockchain_tx_id' AND data_type='text'
  ) THEN
    ALTER TABLE match_proposals
      ALTER COLUMN blockchain_tx_id TYPE TEXT[] USING ARRAY[blockchain_tx_id];
  END IF;
END$$;

ALTER TABLE payments
ADD COLUMN IF NOT EXISTS blockchain_tx_id TEXT[];
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='payments' AND column_name='blockchain_tx_id' AND data_type='text'
  ) THEN
    ALTER TABLE payments
      ALTER COLUMN blockchain_tx_id TYPE TEXT[] USING ARRAY[blockchain_tx_id];
  END IF;
END$$;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS blockchain_tx_id TEXT[];
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='users' AND column_name='blockchain_tx_id' AND data_type='text'
  ) THEN
    ALTER TABLE users
      ALTER COLUMN blockchain_tx_id TYPE TEXT[] USING ARRAY[blockchain_tx_id];
  END IF;
END$$;

-- Optionally add comments for clarity
COMMENT ON COLUMN placed_orders.blockchain_tx_id IS 'Transaction ID for ledger actions related to this order';
COMMENT ON COLUMN match_proposals.blockchain_tx_id IS 'Ledger tx id for proposal operations (acceptance etc.)';
COMMENT ON COLUMN payments.blockchain_tx_id IS 'Ledger tx id for payment lifecycle actions (release, refund)';
COMMENT ON COLUMN users.blockchain_tx_id IS 'Ledger tx id for user registration on the blockchain';
