-- Combined migration script to update database constraints for PENDING_BUYER status
-- Run this in Supabase SQL Editor

-- =====================================================
-- Update match_proposals table constraint
-- =====================================================

-- Drop existing constraint
ALTER TABLE match_proposals
DROP CONSTRAINT IF EXISTS match_proposals_status_check;

-- Add new constraint with PENDING_BUYER
ALTER TABLE match_proposals
ADD CONSTRAINT match_proposals_status_check
CHECK (status IN ('PENDING_BUYER', 'PENDING_FARMER', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED'));

-- =====================================================
-- Update placed_orders table constraint
-- =====================================================

-- Drop existing constraint
ALTER TABLE placed_orders
DROP CONSTRAINT IF EXISTS placed_orders_status_check;

-- Add new constraint with PENDING_BUYER
ALTER TABLE placed_orders
ADD CONSTRAINT placed_orders_status_check
CHECK (status IN ('OPEN', 'PENDING_BUYER', 'PENDING_FARMER', 'CONFIRMED', 'CANCELLED'));

-- =====================================================
-- Optional: Migrate existing data (uncomment if needed)
-- =====================================================

-- If you have existing PENDING_FARMER proposals that should be PENDING_BUYER:
-- UPDATE match_proposals SET status = 'PENDING_BUYER' WHERE status = 'PENDING_FARMER' AND created_at > '2026-01-01';

-- If you have existing PENDING_FARMER orders that should be PENDING_BUYER:
-- UPDATE placed_orders SET status = 'PENDING_BUYER' WHERE status = 'PENDING_FARMER' AND created_at > '2026-01-01';