-- Check the freshroute_prices that were just inserted
SELECT 
  f.name,
  f.variety,
  fp.grade,
  fp.price,
  fp.source_min_price,
  fp.source_max_price,
  fp.margin_pct,
  fp.target_date
FROM freshroute_prices fp
JOIN fruits f ON fp.fruit_id = f.id
WHERE DATE(fp.target_date) = CURRENT_DATE
  AND f.name IN ('Banana', 'Mango', 'Pineapple')
ORDER BY f.name, fp.grade;
