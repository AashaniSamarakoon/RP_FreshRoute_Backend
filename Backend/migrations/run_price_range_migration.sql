-- ============================================
-- PRICE RANGE MIGRATION FOR EXISTING TABLE
-- Run this in Supabase SQL Editor
-- Date: 2026-01-05
-- ============================================

-- The table already has min_price and max_price columns
-- This script will:
-- 1. Update existing data to populate min/max from price_per_unit
-- 2. Add helper function for formatting
-- 3. Create a view for easy querying

-- ============================================
-- STEP 1: Update existing records and remove legacy average column
-- ============================================

-- Drop dependent view before removing legacy column
DROP VIEW IF EXISTS public.v_price_ranges;

-- Set min_price and max_price to the legacy price_per_unit for all existing records where they are NULL
UPDATE public.economic_center_prices
SET 
  min_price = COALESCE(min_price, price_per_unit),
  max_price = COALESCE(max_price, price_per_unit)
WHERE min_price IS NULL OR max_price IS NULL;

-- Drop legacy average column now that range is canonical
ALTER TABLE public.economic_center_prices
DROP COLUMN IF EXISTS price_per_unit;

-- Verify the update
SELECT 
  COUNT(*) as total_records,
  COUNT(CASE WHEN min_price IS NOT NULL THEN 1 END) as records_with_min,
  COUNT(CASE WHEN max_price IS NOT NULL THEN 1 END) as records_with_max,
  COUNT(CASE WHEN min_price = max_price THEN 1 END) as fixed_prices,
  COUNT(CASE WHEN min_price != max_price THEN 1 END) as price_ranges
FROM public.economic_center_prices;

-- ============================================
-- STEP 2: Add column comments for documentation
-- ============================================

COMMENT ON COLUMN public.economic_center_prices.min_price IS 'Minimum price in range (e.g., for "Rs. 100-150", this is 100)';
COMMENT ON COLUMN public.economic_center_prices.max_price IS 'Maximum price in range (e.g., for "Rs. 100-150", this is 150)';

-- ============================================
-- STEP 3: Create helper function for formatting
-- ============================================

CREATE OR REPLACE FUNCTION public.format_price_range(
  min_price numeric, 
  max_price numeric, 
  currency text DEFAULT 'LKR'
)
RETURNS text AS $$
BEGIN
  IF min_price IS NULL OR max_price IS NULL THEN
    RETURN NULL;
  END IF;
  
  IF min_price = max_price THEN
    RETURN currency || ' ' || ROUND(min_price, 2)::text;
  ELSE
    RETURN currency || ' ' || ROUND(min_price, 2)::text || '-' || ROUND(max_price, 2)::text;
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION public.format_price_range IS 'Formats price range: "LKR 100-150" or "LKR 100" if same';

-- ============================================
-- STEP 4: Create a view for easy querying
-- ============================================

CREATE OR REPLACE VIEW public.v_price_ranges AS
SELECT 
  id,
  economic_center,
  fruit_id,
  fruit_name,
  variety,
  ROUND(min_price, 2) as min_price,
  ROUND(max_price, 2) as max_price,
  ROUND(((min_price + max_price) / 2), 2) as avg_price,
  format_price_range(min_price, max_price, currency) as price_display,
  CASE 
    WHEN min_price = max_price THEN 'Fixed'
    WHEN (max_price - min_price) <= 20 THEN 'Narrow Range'
    WHEN (max_price - min_price) <= 50 THEN 'Medium Range'
    ELSE 'Wide Range'
  END as range_category,
  ROUND(((max_price - min_price) / NULLIF(min_price, 0) * 100), 1) as price_variation_pct,
  unit,
  currency,
  captured_at,
  captured_at::date as price_date,
  source_url,
  image_url,
  created_at
FROM public.economic_center_prices;

COMMENT ON VIEW public.v_price_ranges IS 'Formatted view of price ranges with helpful calculated fields';

-- ============================================
-- STEP 5: Verify the migration
-- ============================================

-- Show sample data with formatted ranges
SELECT 
  fruit_name,
  variety,
  ROUND(min_price, 2) as min,
  ROUND(max_price, 2) as max,
  ROUND(((min_price + max_price) / 2), 2) as avg,
  format_price_range(min_price, max_price, currency) as display_price,
  unit,
  economic_center,
  captured_at::date as date
FROM public.economic_center_prices
WHERE captured_at >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY captured_at DESC, fruit_name
LIMIT 20;

-- ============================================
-- STEP 6: Test the view
-- ============================================

SELECT * FROM public.v_price_ranges 
WHERE price_date = CURRENT_DATE 
ORDER BY fruit_name;

-- ============================================
-- SUCCESS MESSAGE
-- ============================================

DO $$
BEGIN
  RAISE NOTICE '✅ Migration completed successfully!';
  RAISE NOTICE 'Price ranges are now enabled for economic_center_prices table.';
  RAISE NOTICE 'Use format_price_range() function or v_price_ranges view for easy querying.';
END $$;
