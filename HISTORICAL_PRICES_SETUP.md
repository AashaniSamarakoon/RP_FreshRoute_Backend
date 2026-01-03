# Historical Market Prices Setup

## Overview
This system maintains two tables:
- **economic_center_prices**: Contains ONLY today's live prices
- **historical_market_prices**: Archives old prices automatically

## Setup Steps

### 1. Create Historical Prices Table in Supabase

Go to your Supabase Dashboard > SQL Editor and run this SQL:

```sql
CREATE TABLE IF NOT EXISTS historical_market_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fruit_id UUID REFERENCES fruits(id) ON DELETE SET NULL,
  fruit_name TEXT NOT NULL,
  variety TEXT,
  price_per_unit NUMERIC NOT NULL,
  unit TEXT DEFAULT 'kg',
  currency TEXT DEFAULT 'LKR',
  economic_center TEXT NOT NULL,
  source_url TEXT,
  captured_at TIMESTAMP WITH TIME ZONE NOT NULL,
  archived_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_historical_captured_at ON historical_market_prices(captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_historical_fruit ON historical_market_prices(fruit_id);
CREATE INDEX IF NOT EXISTS idx_historical_economic_center ON historical_market_prices(economic_center);
CREATE INDEX IF NOT EXISTS idx_historical_archived_at ON historical_market_prices(archived_at DESC);
```

### 2. Test the Archiver

```bash
node scripts/test-price-archiver.js
```

This will move any prices older than today from `economic_center_prices` to `historical_market_prices`.

## How It Works

### Automatic Archival
- **Time**: Daily at 6:05 AM (5 minutes after price scraping at 6:00 AM)
- **Action**: Moves all prices older than today to `historical_market_prices`
- **Cleanup**: Deletes archived records from `economic_center_prices`

### Boot Archival
- When backend starts, it runs archival immediately
- Ensures only today's prices remain in the live table

### Data Flow
```
Dambulla Website
       ↓
[6:00 AM] Scrape → economic_center_prices (today only)
       ↓
[6:05 AM] Archive → Move old prices → historical_market_prices
       ↓
economic_center_prices (only today)
historical_market_prices (all history)
```

## API Endpoints

### Live Market Prices (Today Only)
```
GET /api/farmer/live-market?location=Dambulla
```
Returns: Today's prices only

### Historical Prices
```
GET /api/farmer/prices/history?days=30&location=Dambulla&fruit=Mango
```

**Parameters:**
- `days` (default: 30) - Look back N days (1-365)
- `location` (optional) - Filter by location
- `fruit` (optional) - Filter by fruit name

**Response:**
```json
{
  "location": "Dambulla",
  "fruit": "Mango",
  "daysBack": 30,
  "totalRecords": 45,
  "trends": {
    "Mango": [
      { "date": "2026-01-03", "price": 180, "unit": "kg" },
      { "date": "2026-01-02", "price": 175, "unit": "kg" },
      ...
    ]
  }
}
```

## Benefits

✅ **Live Table Clean**: `economic_center_prices` only has current prices
✅ **Full History**: `historical_market_prices` keeps all old data
✅ **Fast Queries**: Less data to scan for live-market queries
✅ **Trend Analysis**: Historical data available for analysis
✅ **Automatic**: No manual intervention needed

## Manual Archival (Optional)

```bash
node scripts/test-price-archiver.js
```

Or via the scheduler directly:
```javascript
const { archiveOldPrices } = require('./services/priceArchiver');
const result = await archiveOldPrices();
console.log(`Archived: ${result.archivedCount} records`);
```

---

**Next**: After setting up the table, restart your backend and the archival will run automatically!
