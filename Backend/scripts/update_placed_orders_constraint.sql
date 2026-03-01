-- Update placed_orders table constraint to include PENDING_BUYER status
-- Run this in Supabase SQL Editor or as a migration

-- First, drop the existing constraint (if it exists)
ALTER TABLE placed_orders
DROP CONSTRAINT IF EXISTS placed_orders_status_check;

-- Then add the new constraint with PENDING_BUYER included
ALTER TABLE placed_orders
ADD CONSTRAINT placed_orders_status_check
CHECK (status IN ('OPEN', 'PENDING_BUYER', 'PENDING_FARMER', 'CONFIRMED', 'CANCELLED'));

-- Optional: Update any existing records if needed
-- (Only run these if you want to migrate existing data)
-- UPDATE placed_orders SET status = 'PENDING_BUYER' WHERE status = 'PENDING_FARMER' AND created_at > '2026-01-01';