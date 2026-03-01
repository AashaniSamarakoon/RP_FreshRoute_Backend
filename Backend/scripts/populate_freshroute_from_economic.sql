-- Insert FreshRoute prices from economic_center_prices data
-- This script fetches the latest prices for Banana, Mango, and Pineapple
-- from economic_center_prices and creates 4 grades for each

INSERT INTO freshroute_prices (
  fruit_id,
  fruit_name,
  variety,
  grade,
  target_date,
  price,
  source_min_price,
  source_max_price,
  margin_pct,
  created_at,
  updated_at
)
SELECT
  ecp.fruit_id,
  f.name AS fruit_name,
  f.variety,
  grades.grade,
  CURRENT_DATE AS target_date,
  calculate_grade_price(ecp.min_price, ecp.max_price, grades.grade, 2) AS price,
  ecp.min_price,
  ecp.max_price,
  2 AS margin_pct,
  NOW() AS created_at,
  NOW() AS updated_at
FROM
  economic_center_prices ecp
  JOIN fruits f ON ecp.fruit_id = f.id
  CROSS JOIN (SELECT 'A' AS grade UNION SELECT 'B' UNION SELECT 'C' UNION SELECT 'D') grades
WHERE
  f.id IN (
    '41c979ad-24e9-4c08-9d1f-5a891e4f0df4', -- Banana Ambul
    '69005a2e-534a-4ad6-97a8-f9cd2870c9c', -- Mango TJC
    '962b16ea-7710-4f0d-a880-e865f425afeb'  -- Pineapple All
  )
  AND DATE(ecp.captured_at) = CURRENT_DATE
ON CONFLICT (fruit_id, target_date, grade) DO UPDATE SET
  price = calculate_grade_price(EXCLUDED.source_min_price, EXCLUDED.source_max_price, EXCLUDED.grade, 2),
  source_min_price = EXCLUDED.source_min_price,
  source_max_price = EXCLUDED.source_max_price,
  updated_at = NOW();

-- Verify the inserted data
SELECT 
  f.name,
  f.variety,
  fp.grade,
  fp.price,
  fp.source_min_price,
  fp.source_max_price,
  fp.target_date
FROM freshroute_prices fp
JOIN fruits f ON fp.fruit_id = f.id
WHERE DATE(fp.target_date) = CURRENT_DATE
  AND f.id IN (
    '41c979ad-24e9-4c08-9d1f-5a891e4f0df4',
    '69005a2e-534a-4ad6-97a8-f9cd2870c9c',
    '962b16ea-7710-4f0d-a880-e865f425afeb'
  )
ORDER BY f.name, fp.grade;
