-- ============================================
-- HISTORICAL PRICE RANGE MIGRATION
-- Run this in Supabase SQL Editor
-- Date: 2026-01-05
-- ============================================
-- Goal: bring historical_market_prices in line with range-only model (min_price/max_price)
-- Steps:
-- 1) Add min_price and max_price columns if missing
-- 2) Backfill from legacy price_per_unit
-- 3) Drop price_per_unit
-- 4) Add comments and verify

-- ============================================
-- STEP 1: Add columns if needed
-- ============================================
ALTER TABLE public.historical_market_prices
  ADD COLUMN IF NOT EXISTS min_price numeric,
  ADD COLUMN IF NOT EXISTS max_price numeric;

-- ============================================
-- STEP 2: Backfill from legacy price_per_unit
-- ============================================
UPDATE public.historical_market_prices
SET
  min_price = COALESCE(min_price, price_per_unit),
  max_price = COALESCE(max_price, price_per_unit)
WHERE min_price IS NULL OR max_price IS NULL;

-- ============================================
-- STEP 3: Drop legacy average column
-- ============================================
ALTER TABLE public.historical_market_prices
DROP COLUMN IF EXISTS price_per_unit;

-- ============================================
-- STEP 4: Add column comments
-- ============================================
COMMENT ON COLUMN public.historical_market_prices.min_price IS 'Minimum price in range (e.g., for "Rs. 100-150", this is 100)';
COMMENT ON COLUMN public.historical_market_prices.max_price IS 'Maximum price in range (e.g., for "Rs. 100-150", this is 150)';

-- ============================================
-- STEP 5: Quick verification
-- ============================================
SELECT
  COUNT(*) AS total_records,
  COUNT(CASE WHEN min_price IS NOT NULL THEN 1 END) AS records_with_min,
  COUNT(CASE WHEN max_price IS NOT NULL THEN 1 END) AS records_with_max,
  COUNT(CASE WHEN min_price = max_price THEN 1 END) AS fixed_prices,
  COUNT(CASE WHEN min_price != max_price THEN 1 END) AS price_ranges
FROM public.historical_market_prices;

DO $$
BEGIN
  RAISE NOTICE 'Historical price range migration completed';
END $$;
