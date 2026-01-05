-- SQL Queries for Viewing Price Ranges in Database

-- ============================================
-- 1. VIEW ALL PRICES WITH FORMATTED RANGES
-- ============================================

-- Simple view with formatted price range
SELECT 
  fruit_name,
  variety,
  CASE 
    WHEN min_price = max_price THEN 
      currency || ' ' || ROUND(min_price, 2)::text
    ELSE 
      currency || ' ' || ROUND(min_price, 2)::text || '-' || ROUND(max_price, 2)::text
  END as price_range,
  ROUND(price_per_unit, 2) as avg_price,
  unit,
  economic_center,
  captured_at::date as date
FROM economic_center_prices
WHERE captured_at >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY captured_at DESC, fruit_name;

-- ============================================
-- 2. VIEW TODAY'S PRICES WITH RANGE INDICATOR
-- ============================================

SELECT 
  fruit_name,
  variety,
  ROUND(min_price, 2) as min_price,
  ROUND(max_price, 2) as max_price,
  ROUND(price_per_unit, 2) as avg_price,
  CASE 
    WHEN min_price = max_price THEN 'Fixed Price'
    ELSE 'Price Range'
  END as price_type,
  unit,
  currency,
  economic_center,
  TO_CHAR(captured_at, 'YYYY-MM-DD HH24:MI:SS') as captured_time
FROM economic_center_prices
WHERE captured_at::date = CURRENT_DATE
ORDER BY fruit_name, variety;

-- ============================================
-- 3. VIEW WITH FORMATTED DISPLAY (USING FUNCTION)
-- ============================================

SELECT 
  fruit_name,
  variety,
  format_price_range(min_price, max_price, currency) as display_price,
  ROUND(price_per_unit, 2) as average,
  unit,
  economic_center,
  captured_at::date as date
FROM economic_center_prices
WHERE captured_at >= CURRENT_DATE - INTERVAL '30 days'
ORDER BY captured_at DESC, fruit_name;

-- ============================================
-- 4. COMPARE PRICES BY FRUIT (SHOW RANGE VARIATIONS)
-- ============================================

SELECT 
  fruit_name,
  COUNT(*) as price_entries,
  MIN(min_price) as lowest_price,
  MAX(max_price) as highest_price,
  ROUND(AVG(price_per_unit), 2) as avg_price,
  currency || ' ' || ROUND(MIN(min_price), 2)::text || '-' || ROUND(MAX(max_price), 2)::text as overall_range,
  STRING_AGG(DISTINCT economic_center, ', ') as centers
FROM economic_center_prices
WHERE captured_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY fruit_name, currency
ORDER BY fruit_name;

-- ============================================
-- 5. VIEW PRICE HISTORY WITH RANGES (CHART DATA)
-- ============================================

SELECT 
  fruit_name,
  captured_at::date as date,
  ROUND(MIN(min_price), 2) as day_min,
  ROUND(MAX(max_price), 2) as day_max,
  ROUND(AVG(price_per_unit), 2) as day_avg,
  COUNT(*) as entries,
  currency
FROM economic_center_prices
WHERE fruit_name = 'Mango' -- Change fruit name as needed
  AND captured_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY fruit_name, captured_at::date, currency
ORDER BY date DESC;

-- ============================================
-- 6. CREATE A VIEW FOR EASY QUERYING
-- ============================================

CREATE OR REPLACE VIEW v_price_ranges AS
SELECT 
  id,
  economic_center,
  fruit_id,
  fruit_name,
  variety,
  ROUND(min_price, 2) as min_price,
  ROUND(max_price, 2) as max_price,
  ROUND(price_per_unit, 2) as avg_price,
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
  created_at
FROM economic_center_prices;

-- Now query the view easily:
SELECT * FROM v_price_ranges 
WHERE price_date = CURRENT_DATE 
ORDER BY fruit_name;

-- ============================================
-- 7. FIND FRUITS WITH LARGEST PRICE VARIATIONS
-- ============================================

SELECT 
  fruit_name,
  variety,
  ROUND(min_price, 2) as min,
  ROUND(max_price, 2) as max,
  ROUND(max_price - min_price, 2) as price_spread,
  ROUND(((max_price - min_price) / NULLIF(min_price, 0) * 100), 1) as variation_percentage,
  format_price_range(min_price, max_price, currency) as price_range,
  economic_center,
  captured_at::date as date
FROM economic_center_prices
WHERE captured_at >= CURRENT_DATE - INTERVAL '7 days'
  AND min_price != max_price  -- Only show ranges, not fixed prices
ORDER BY (max_price - min_price) DESC
LIMIT 20;

-- ============================================
-- 8. PRICE RANGE STATISTICS BY CENTER
-- ============================================

SELECT 
  economic_center,
  COUNT(DISTINCT fruit_name) as total_fruits,
  COUNT(CASE WHEN min_price = max_price THEN 1 END) as fixed_prices,
  COUNT(CASE WHEN min_price != max_price THEN 1 END) as range_prices,
  ROUND(AVG(price_per_unit), 2) as avg_overall_price,
  ROUND(AVG(max_price - min_price), 2) as avg_price_spread,
  captured_at::date as date
FROM economic_center_prices
WHERE captured_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY economic_center, captured_at::date
ORDER BY date DESC, economic_center;

-- ============================================
-- 9. EXPORT FORMAT FOR REPORTS
-- ============================================

SELECT 
  ROW_NUMBER() OVER (ORDER BY fruit_name, captured_at DESC) as row_num,
  fruit_name as "Fruit Name",
  variety as "Variety",
  format_price_range(min_price, max_price, currency) as "Price",
  unit as "Unit",
  economic_center as "Market",
  TO_CHAR(captured_at, 'DD/MM/YYYY') as "Date",
  TO_CHAR(captured_at, 'HH24:MI') as "Time"
FROM economic_center_prices
WHERE captured_at::date = CURRENT_DATE
ORDER BY fruit_name, variety;

-- ============================================
-- 10. PRICE ALERTS (Unusual Ranges)
-- ============================================

WITH avg_spreads AS (
  SELECT 
    fruit_name,
    AVG(max_price - min_price) as avg_spread,
    STDDEV(max_price - min_price) as stddev_spread
  FROM economic_center_prices
  WHERE captured_at >= CURRENT_DATE - INTERVAL '30 days'
  GROUP BY fruit_name
)
SELECT 
  p.fruit_name,
  p.variety,
  ROUND(p.min_price, 2) as min,
  ROUND(p.max_price, 2) as max,
  ROUND(p.max_price - p.min_price, 2) as spread,
  ROUND(a.avg_spread, 2) as typical_spread,
  format_price_range(p.min_price, p.max_price, p.currency) as price_range,
  p.economic_center,
  p.captured_at::date as date,
  CASE 
    WHEN (p.max_price - p.min_price) > (a.avg_spread + 2 * COALESCE(a.stddev_spread, 0)) 
    THEN '⚠️ Unusually Wide Range'
    ELSE 'Normal'
  END as alert
FROM economic_center_prices p
JOIN avg_spreads a ON p.fruit_name = a.fruit_name
WHERE p.captured_at >= CURRENT_DATE - INTERVAL '7 days'
  AND p.min_price != p.max_price
ORDER BY (p.max_price - p.min_price) DESC;
