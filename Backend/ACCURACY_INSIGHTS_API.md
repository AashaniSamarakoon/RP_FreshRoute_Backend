# Accuracy Insights API Documentation

## Overview
The Accuracy Insights feature compares forecasted prices with actual historical market prices to calculate prediction accuracy metrics.

## Features
- ✅ Overall accuracy across all fruits for last 7 days
- ✅ Per-fruit accuracy breakdown
- ✅ Automatic date filtering (uses only days with actual historical data)
- ✅ Detailed price comparisons (actual vs predicted)
- ✅ Percent error calculations
- ✅ Flexible to less than 7 days of data (uses whatever is available)

## API Endpoints

### 1. Get Overall Accuracy Insights
**Endpoint:** `GET /api/farmer/accuracy/insights`

**Description:** Calculate overall accuracy and per-fruit accuracy for the last 7 days.

**Response:**
```json
{
  "summary": {
    "daysAnalyzed": 3,
    "analyzedDates": ["2026-01-04", "2026-01-05", "2026-01-06"],
    "totalComparisons": 9,
    "overallAccuracy": 85.5,
    "analysisDate": "2026-01-06",
    "dateRange": {
      "from": "2025-12-30",
      "to": "2026-01-06"
    }
  },
  "perFruitAccuracy": {
    "Banana": {
      "fruit_id": "41c979ad-24e9-4c08-9d1f-5a891e4f0df4",
      "comparisons": 3,
      "average_percent_error": 12.45,
      "accuracy": 87.55,
      "prices": [
        {
          "date": "2026-01-06",
          "actual": 130,
          "predicted": 128,
          "error": 1.54
        },
        {
          "date": "2026-01-05",
          "actual": 125,
          "predicted": 130,
          "error": 4.0
        },
        {
          "date": "2026-01-04",
          "actual": 120,
          "predicted": 115,
          "error": 4.17
        }
      ]
    },
    "Mango": {
      "fruit_id": "c5d7e8f9-g0h1-i2j3-k4l5-m6n7o8p9q0r1",
      "comparisons": 3,
      "average_percent_error": 8.33,
      "accuracy": 91.67,
      "prices": [...]
    },
    "Pineapple": {
      "fruit_id": "p9q0r1s2-t3u4-v5w6-x7y8-z9a0b1c2d3e4",
      "comparisons": 3,
      "average_percent_error": 15.2,
      "accuracy": 84.8,
      "prices": [...]
    }
  },
  "detailedComparisons": [
    {
      "fruit_id": "41c979ad-24e9-4c08-9d1f-5a891e4f0df4",
      "fruit_name": "Banana",
      "market_date": "2026-01-06",
      "actual_price": 130,
      "predicted_price": 128,
      "absolute_error": 2,
      "percent_error": 1.54,
      "accuracy": 98.46,
      "prediction_source": "forecasts_model_v1"
    },
    ...
  ]
}
```

### 2. Get Fruit-Specific Accuracy Details
**Endpoint:** `GET /api/farmer/accuracy/fruit/:fruitId`

**Description:** Get detailed accuracy metrics for a specific fruit.

**Parameters:**
- `fruitId` (string, required): UUID of the fruit to analyze

**Response:**
```json
{
  "fruit": {
    "id": "41c979ad-24e9-4c08-9d1f-5a891e4f0df4",
    "name": "Banana",
    "variety": "Ambul"
  },
  "analysisMetrics": {
    "daysAnalyzed": 3,
    "comparisonsWithForecasts": 3,
    "totalHistoricalRecords": 3,
    "averageAccuracy": 87.55,
    "averagePercentError": 12.45
  },
  "comparisons": [
    {
      "date": "2026-01-06",
      "actual": 130,
      "predicted": 128,
      "error": 1.54,
      "accuracy": 98.46
    },
    {
      "date": "2026-01-05",
      "actual": 125,
      "predicted": 130,
      "error": 4.0,
      "accuracy": 96.0
    },
    {
      "date": "2026-01-04",
      "actual": 120,
      "predicted": 115,
      "error": 4.17,
      "accuracy": 95.83
    }
  ]
}
```

## Data Sources
- **Historical Prices:** `historical_market_prices` table
- **Forecasts:** `forecasts` table
- **Fruit Details:** `fruits` table

## How It Works

### Process Flow:
1. **Get Last 7 Days:** Query `historical_market_prices` for dates in last 7 days
2. **Identify Available Dates:** If only 3 days found, uses those 3 days
3. **Get Matching Forecasts:** Queries `forecasts` table for same dates and fruits
4. **Calculate Metrics:**
   - Percent Error = |Predicted - Actual| / Actual × 100
   - Accuracy = 100 - Percent Error
5. **Aggregate:**
   - Overall accuracy: Average accuracy across all comparisons
   - Per-fruit accuracy: Average accuracy for each fruit
   - Detailed breakdown: Individual price comparisons

## Metrics Explanation

| Metric | Meaning |
|--------|---------|
| **Overall Accuracy** | Average accuracy across all fruits and dates (%) |
| **Per-Fruit Accuracy** | Average accuracy for a specific fruit (%) |
| **Percent Error** | Percentage difference between predicted and actual price |
| **Absolute Error** | Absolute difference in rupees between predicted and actual |
| **Days Analyzed** | Number of days with both historical and forecast data |
| **Total Comparisons** | Number of fruit-date combinations analyzed |

## Example Usage

### Get overall accuracy:
```bash
curl -X GET http://localhost:4000/api/farmer/accuracy/insights \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Get accuracy for a specific fruit:
```bash
curl -X GET http://localhost:4000/api/farmer/accuracy/fruit/41c979ad-24e9-4c08-9d1f-5a891e4f0df4 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Key Features

✅ **Flexible Date Range:** Automatically adapts to available data (e.g., if only 3 days available, uses 3 days)  
✅ **Precise Matching:** Only compares prices when both historical and forecast data exist  
✅ **Detailed Breakdown:** Shows per-fruit and per-date accuracy  
✅ **Error Analysis:** Helps identify forecasting accuracy patterns  
✅ **Time-based Filtering:** Always looks at last 7 calendar days from current date  

## Error Handling

- Returns 500 status if forecasts or historical_market_prices tables unavailable
- Returns 404 if fruit not found (for fruit-specific endpoint)
- Gracefully handles missing forecast data (shows "no_forecast_available" status)
- Shows analysis even with partial data (e.g., 2 days instead of 7)
