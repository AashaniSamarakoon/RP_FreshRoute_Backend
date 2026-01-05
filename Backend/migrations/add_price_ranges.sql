-- Migration: Add price range support to economic_center_prices table
-- Date: 2026-01-05
-- Description: Adds min_price and max_price columns to support price ranges from economic centers

-- Add new columns for price ranges
ALTER TABLE public.economic_center_prices
  ADD COLUMN IF NOT EXISTS min_price numeric NULL,
  ADD COLUMN IF NOT EXISTS max_price numeric NULL;

-- Update existing data: set min_price and max_price to current price_per_unit
UPDATE public.economic_center_prices
SET 
  min_price = price_per_unit,
  max_price = price_per_unit
WHERE min_price IS NULL OR max_price IS NULL;

-- Add comment to explain the columns
COMMENT ON COLUMN public.economic_center_prices.min_price IS 'Minimum price in the price range (for price ranges like "Rs. 100-150")';
COMMENT ON COLUMN public.economic_center_prices.max_price IS 'Maximum price in the price range (for price ranges like "Rs. 100-150")';
COMMENT ON COLUMN public.economic_center_prices.price_per_unit IS 'Average/single price - computed as (min_price + max_price) / 2 for ranges, or single price';

CREATE OR REPLACE FUNCTION public.format_price_range(min_price numeric, max_price numeric, currency text DEFAULT 'LKR')
RETURNS text AS $$
BEGIN
  IF min_price = max_price THEN
    RETURN currency || ' ' || min_price::text;
  ELSE
    RETURN currency || ' ' || min_price::text || '-' || max_price::text;
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION public.format_price_range IS 'Formats price range for display: "LKR 100-150" or "LKR 100"';
