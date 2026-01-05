-- Insert sample FreshRoute prices for Banana, Mango, and Pineapple
-- Date: January 5, 2026

DO $$
DECLARE
  banana_id UUID;
  mango_id UUID;
  pineapple_id UUID;
  target_date DATE := '2026-01-05';
BEGIN

-- Get fruit IDs
SELECT id INTO banana_id FROM fruits WHERE name = 'Banana' AND variety = 'Ambul' LIMIT 1;
SELECT id INTO mango_id FROM fruits WHERE name = 'Mango' AND variety = 'TJC' LIMIT 1;
SELECT id INTO pineapple_id FROM fruits WHERE name = 'Pineapple' AND variety = 'All' LIMIT 1;

-- Log the IDs found
RAISE NOTICE 'Banana ID: %', banana_id;
RAISE NOTICE 'Mango ID: %', mango_id;
RAISE NOTICE 'Pineapple ID: %', pineapple_id;

-- Delete existing prices for these fruits on this date (to avoid duplicates)
DELETE FROM freshroute_prices 
WHERE target_date = target_date 
  AND fruit_id IN (banana_id, mango_id, pineapple_id);

-- Insert Banana (Ambul) - Price range: 80-120
IF banana_id IS NOT NULL THEN
  INSERT INTO freshroute_prices (fruit_id, fruit_name, variety, grade, target_date, price, source_min_price, source_max_price, margin_pct)
  VALUES 
    (banana_id, 'Banana', 'Ambul', 'A', target_date, calculate_grade_price(80, 120, 'A', 2), 80, 120, 2),
    (banana_id, 'Banana', 'Ambul', 'B', target_date, calculate_grade_price(80, 120, 'B', 2), 80, 120, 2),
    (banana_id, 'Banana', 'Ambul', 'C', target_date, calculate_grade_price(80, 120, 'C', 2), 80, 120, 2),
    (banana_id, 'Banana', 'Ambul', 'D', target_date, calculate_grade_price(80, 120, 'D', 2), 80, 120, 2);
  RAISE NOTICE 'Inserted 4 grades for Banana (Ambul)';
END IF;

-- Insert Mango (TJC) - Price range: 150-250
IF mango_id IS NOT NULL THEN
  INSERT INTO freshroute_prices (fruit_id, fruit_name, variety, grade, target_date, price, source_min_price, source_max_price, margin_pct)
  VALUES 
    (mango_id, 'Mango', 'TJC', 'A', target_date, calculate_grade_price(150, 250, 'A', 2), 150, 250, 2),
    (mango_id, 'Mango', 'TJC', 'B', target_date, calculate_grade_price(150, 250, 'B', 2), 150, 250, 2),
    (mango_id, 'Mango', 'TJC', 'C', target_date, calculate_grade_price(150, 250, 'C', 2), 150, 250, 2),
    (mango_id, 'Mango', 'TJC', 'D', target_date, calculate_grade_price(150, 250, 'D', 2), 150, 250, 2);
  RAISE NOTICE 'Inserted 4 grades for Mango (TJC)';
END IF;

-- Insert Pineapple (All) - Price range: 60-100
IF pineapple_id IS NOT NULL THEN
  INSERT INTO freshroute_prices (fruit_id, fruit_name, variety, grade, target_date, price, source_min_price, source_max_price, margin_pct)
  VALUES 
    (pineapple_id, 'Pineapple', 'All', 'A', target_date, calculate_grade_price(60, 100, 'A', 2), 60, 100, 2),
    (pineapple_id, 'Pineapple', 'All', 'B', target_date, calculate_grade_price(60, 100, 'B', 2), 60, 100, 2),
    (pineapple_id, 'Pineapple', 'All', 'C', target_date, calculate_grade_price(60, 100, 'C', 2), 60, 100, 2),
    (pineapple_id, 'Pineapple', 'All', 'D', target_date, calculate_grade_price(60, 100, 'D', 2), 60, 100, 2);
  RAISE NOTICE 'Inserted 4 grades for Pineapple (All)';
END IF;

RAISE NOTICE 'Data insertion complete!';

END $$;

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
WHERE fp.target_date = '2026-01-05'
  AND (f.name IN ('Banana', 'Mango', 'Pineapple'))
ORDER BY f.name, fp.grade;
