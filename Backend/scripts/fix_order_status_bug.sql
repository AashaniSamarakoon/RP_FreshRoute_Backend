-- Fix orders that were set to wrong status by the matching bugs
-- Run this ONCE in Supabase SQL Editor after deploying the backend fix.

-- 1. Orders stuck in PENDING_ACCEPTANCE → correct to PENDING_BUYER
--    (set by old orderController.js code after matching ran)
UPDATE placed_orders
SET status = 'PENDING_BUYER', updated_at = NOW()
WHERE status = 'PENDING_ACCEPTANCE'
  AND id IN (
    SELECT DISTINCT order_id FROM match_proposals
    WHERE status IN ('PENDING_BUYER', 'PENDING_FARMER')
  );

-- 2. Orders set to PENDING_FARMER by batch matching without buyer approval
--    (batch cron skipped the buyer-approval step)
--    Only correct those that still only have PENDING_BUYER proposals
--    (i.e., no proposal has been promoted to PENDING_FARMER by buyer approval yet).
UPDATE placed_orders
SET status = 'PENDING_BUYER', updated_at = NOW()
WHERE status = 'PENDING_FARMER'
  AND id IN (
    SELECT order_id FROM match_proposals
    WHERE status = 'PENDING_BUYER'
  )
  AND id NOT IN (
    SELECT order_id FROM match_proposals
    WHERE status IN ('PENDING_FARMER', 'ACCEPTED', 'AWAITING_PAYMENT')
  );
