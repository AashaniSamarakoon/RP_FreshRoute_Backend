# FreshRoute Pricing System - Complete Setup Checklist

## ✅ What's Been Completed

### 1. Database Schema
- [x] `freshroute_prices` table with grade column (A/B/C/D)
- [x] `freshroute_price_history` table for archival
- [x] `calculate_grade_price()` SQL function
- [x] Proper indexes on fruit_id, target_date, created_at

### 2. Backend Services
- [x] `gradingService.js` - Price calculation by grade
- [x] `freshRoutePriceUpdater.js` - Daily sync and archival logic
- [x] Cron scheduler in `index.js` - Daily 6:00 AM updates
- [x] Initialization on server startup

### 3. API Endpoints
- [x] `GET /api/farmer/prices/freshroute` - Returns graded prices for all fruits
- [x] `GET /api/admin/test/freshroute/update` - Manual trigger for daily update
- [x] `GET /api/admin/test/freshroute/initialize` - Manual trigger for initialization

### 4. Integration
- [x] Import added to `index.js`
- [x] Cron job registered for daily 6:00 AM
- [x] Initialization IIFE called on server startup
- [x] Routes registered in farmer routes
- [x] Test endpoints in admin routes

---

## 🚀 How to Test the System

### Test 1: Check if prices are initialized on startup
```bash
# Look at console logs when server starts
# Expected log: "[Init] Initializing FreshRoute prices..."
# Expected log: "[Init] FreshRoute prices initialized: {message: 'Initialized X fruits'}"
```

### Test 2: Manually trigger update (from Postman/curl)
```bash
GET http://localhost:5000/api/admin/test/freshroute/update

# Expected response:
{
  "status": "success",
  "message": "FreshRoute prices updated successfully",
  "result": {
    "message": "Updated prices for X fruits",
    "fruitsUpdated": [...],
    "archived": X
  }
}
```

### Test 3: Manually trigger initialization
```bash
GET http://localhost:5000/api/admin/test/freshroute/initialize

# Expected response:
{
  "status": "success",
  "message": "FreshRoute prices initialized successfully",
  "result": {
    "message": "Initialized prices for X fruits",
    "fruitsInitialized": [...]
  }
}
```

### Test 4: Fetch graded prices
```bash
GET http://localhost:5000/api/farmer/prices/freshroute

# Expected response:
{
  "date": "2024-01-15",
  "marginPercentage": 2,
  "fruits": [
    {
      "fruit_id": 1,
      "name": "Mango",
      "variety": "Alphonso",
      "image": "...",
      "economicCenterRange": {
        "min": 100,
        "max": 150
      },
      "grades": {
        "A": {
          "price": 153,
          "description": "Premium (Max Price)"
        },
        "B": {
          "price": 136.2,
          "description": "High Quality"
        },
        "C": {
          "price": 126.5,
          "description": "Standard"
        },
        "D": {
          "price": 102,
          "description": "Basic (Min Price)"
        }
      }
    },
    ...
  ]
}
```

---

## 🔍 Database Verification

### Check if tables exist
```sql
SELECT tablename FROM pg_tables 
WHERE schemaname = 'public' 
AND (tablename LIKE 'freshroute%');

-- Should show: freshroute_prices, freshroute_price_history
```

### Check if function exists
```sql
\df calculate_grade_price

-- Should show: (numeric, numeric, char, numeric) → numeric
```

### View current day's prices
```sql
SELECT 
  f.id, 
  f.name, 
  fp.grade, 
  fp.price, 
  fp.source_min_price, 
  fp.source_max_price,
  fp.target_date
FROM freshroute_prices fp
JOIN fruits f ON fp.fruit_id = f.id
WHERE DATE(fp.target_date) = CURRENT_DATE
ORDER BY f.name, fp.grade;
```

### Check archived prices
```sql
SELECT COUNT(*) as archived_count
FROM freshroute_price_history;
```

### Check if archive trigger works
```sql
-- Manually archive old prices (older than today)
DELETE FROM freshroute_prices 
WHERE target_date < CURRENT_DATE
RETURNING *;

-- These records should be moved to freshroute_price_history
```

---

## 📋 How It Works

### Daily Update Flow (runs at 6:00 AM)
1. Fetch all fruits from economic_center_prices (today's date)
2. For each fruit, calculate 4 grade prices (A/B/C/D):
   - Grade A: max_price × 1.02
   - Grade B: ((min + max) / 2 + max) / 2 × 1.02
   - Grade C: ((min + max) / 2 + min) / 2 × 1.02
   - Grade D: min_price × 1.02
3. Upsert all grades to freshroute_prices for today
4. Archive (move to history) any records with target_date < today

### Initialization Flow (on server startup)
1. Check if today's prices already exist
2. If not, initialize all fruits with today's grades
3. If yes, skip initialization

### API Response Format
```
{
  date: Today's date,
  marginPercentage: 2,
  fruits: [
    {
      fruit_id, name, variety, image,
      economicCenterRange: { min, max },
      grades: {
        A: { price, description },
        B: { price, description },
        C: { price, description },
        D: { price, description }
      }
    }
  ]
}
```

---

## ⚠️ Common Issues & Fixes

### Issue: Prices not updating at 6 AM
**Solution**: Check if server is running continuously. Cron jobs only work while Node.js process is active.

### Issue: "Table freshroute_prices not found"
**Solution**: Run the migration:
```bash
# From Backend directory
npm run migrate -- migrations/create_freshroute_grading_tables.sql
```

### Issue: Economic center prices are stale
**Solution**: Run the scraper manually:
```bash
GET http://localhost:5000/api/admin/economic-center/import
```

### Issue: Prices not calculated correctly
**Solution**: Verify the calculate_grade_price() function:
```sql
SELECT calculate_grade_price(100, 200, 'A', 2) as result;
-- Should return: 204 (200 * 1.02)
```

---

## 🔐 Production Considerations

1. **Remove test endpoints**: Delete `/api/admin/test/freshroute/*` routes before deploying to production
2. **Add authentication**: Protect the freshroute endpoint with farmer role check
3. **Add rate limiting**: Prevent abuse of the API endpoints
4. **Add monitoring**: Log all price updates and archival operations
5. **Add error alerts**: Email admin if daily update fails
6. **Backup data**: Archive old prices regularly to a separate table/database

---

## 📝 Files Modified

1. **index.js** - Added freshRoutePriceUpdater import + cron schedule + initialization
2. **routes/farmer/index.js** - Added freshRoutePricesEndpoint import + GET /prices/freshroute route
3. **routes/admin/index.js** - Added test endpoints for manual triggering
4. **Created files**:
   - Services/farmer/gradingService.js
   - Services/farmer/freshRoutePriceUpdater.js
   - routes/farmer/freshRoutePricesEndpoint.js
   - routes/admin/testFreshRouteEndpoint.js
   - migrations/create_freshroute_grading_tables.sql

---

## ✨ Next Steps

1. Run the migration to create tables
2. Start the server and watch for initialization logs
3. Test manual endpoints to verify functionality
4. Test the GET /api/farmer/prices/freshroute endpoint
5. Remove test endpoints before production deployment
