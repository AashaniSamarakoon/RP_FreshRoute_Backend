# Price Range Migration

## Overview
Updated the `economic_center_prices` table to support price ranges instead of single prices, as economic centers (like Dambulla) show prices as ranges (e.g., "Rs. 100-150").

## Changes Made

### 1. Database Schema Updates
Added two new columns to `economic_center_prices` table:
- `min_price` (numeric): Minimum price in the range
- `max_price` (numeric): Maximum price in the range
- `price_per_unit` (existing): Now stores the average = (min_price + max_price) / 2

### 2. Scraper Updates
Updated `dambullaScraper.js` to:
- Parse price ranges from the website (e.g., "100-150", "Rs. 100 - 150")
- Extract min and max prices
- Calculate average price
- Handle both single prices and ranges

### 3. Helper Function
Created `format_price_range()` SQL function to display prices:
- Single price: "LKR 100"
- Price range: "LKR 100-150"

## Migration Steps

### Step 1: Run Database Migration
Execute the SQL script in your Supabase SQL Editor:

```bash
# In Supabase Dashboard > SQL Editor:
# Copy and paste contents of: migrations/run_price_range_migration.sql
```

Or use the migration file directly:
```sql
-- See: Backend/migrations/run_price_range_migration.sql
```

### Step 2: Restart Backend Server
The scraper code has been updated automatically. Just restart your backend:

```bash
cd Backend
npm start
```

### Step 3: Test the Scraper
Manually trigger a price import:

```bash
node -e "require('./Services/farmer/dambullaScraper').importDambullaPrices().then(console.log)"
```

## Usage Examples

### Query Prices with Ranges
```sql
SELECT 
  fruit_name,
  variety,
  min_price,
  max_price,
  price_per_unit as avg_price,
  format_price_range(min_price, max_price, currency) as display_price,
  captured_at
FROM economic_center_prices
WHERE economic_center = 'Dambulla Dedicated Economic Centre'
  AND captured_at >= CURRENT_DATE
ORDER BY fruit_name;
```

### API Response Format
The API will now return:
```json
{
  "fruit_name": "Mango",
  "variety": "TJC",
  "price_per_unit": 125.0,
  "min_price": 100.0,
  "max_price": 150.0,
  "currency": "LKR",
  "unit": "kg"
}
```

Frontend can display as: "Rs. 100-150/kg" or "Rs. 125/kg (range: 100-150)"

## Backward Compatibility
- Existing data is preserved (min_price and max_price set to price_per_unit)
- APIs continue to work (price_per_unit still exists as average)
- Old queries still function normally

## Price Range Parsing Examples

The scraper now handles:
- `"100"` → min: 100, max: 100, avg: 100
- `"100-150"` → min: 100, max: 150, avg: 125
- `"100 - 150"` → min: 100, max: 150, avg: 125
- `"Rs. 100-150"` → min: 100, max: 150, avg: 125
- `"LKR 100 - 150"` → min: 100, max: 150, avg: 125

## Notes
- The scraper still attempts to fetch from https://dambulladec.com/home-dailyprice
- If scraping fails, it uses the latest prices as fallback (now includes min/max)
- All prices are stored in LKR (Sri Lankan Rupees)
- Prices are captured once daily at 6:00 AM Asia/Colombo time
