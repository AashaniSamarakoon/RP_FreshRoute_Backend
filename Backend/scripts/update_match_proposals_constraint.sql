-- Update match_proposals table constraint to include PENDING_BUYER status
-- Run this in Supabase SQL Editor or as a migration

-- First, drop the existing constraint
ALTER TABLE match_proposals
DROP CONSTRAINT IF EXISTS match_proposals_status_check;

-- Then add the new constraint with PENDING_BUYER included
ALTER TABLE match_proposals
ADD CONSTRAINT match_proposals_status_check
CHECK (status IN ('PENDING_BUYER', 'PENDING_FARMER', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED'));

-- Optional: Update any existing PENDING_FARMER records that should be PENDING_BUYER
-- (Only if you want to migrate existing data, otherwise leave as-is)
-- UPDATE match_proposals SET status = 'PENDING_BUYER' WHERE status = 'PENDING_FARMER';