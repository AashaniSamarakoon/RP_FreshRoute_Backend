-- Add blockchain_tx_id column to estimated_stock so we can trace ledger operations
-- Run this in Supabase SQL Editor or include in your migration workflow.

ALTER TABLE estimated_stock
ADD COLUMN IF NOT EXISTS blockchain_tx_id TEXT;

COMMENT ON COLUMN estimated_stock.blockchain_tx_id IS 'Hash/ID of the blockchain transaction associated with this stock record';
