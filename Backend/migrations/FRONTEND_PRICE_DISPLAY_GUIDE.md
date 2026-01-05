# Frontend Price Range Display Guide

## Overview
The API now returns price ranges for economic center prices. This guide shows how to display them in your React Native app.

## API Response Format

### GET /api/farmer/live-market
```json
{
  "location": "Dambulla Dedicated Economic Centre",
  "date": "2026-01-05",
  "lastUpdated": "2026-01-05T06:00:00.000Z",
  "fruits": [
    {
      "name": "Mango",
      "emoji": "🥭",
      "image": "https://...",
      "price": "Rs. 100.00-150.00",
      "priceRange": { "min": 100, "max": 150 },
      "avgPrice": 125,
      "unit": "/ kg",
      "status": "Medium",
      "statusColor": "#fef9c3"
    },
    {
      "name": "Banana",
      "emoji": "🍌",
      "image": "https://...",
      "price": "Rs. 80.00",
      "priceRange": null,
      "avgPrice": 80,
      "unit": "/ kg",
      "status": "Low",
      "statusColor": "#fee2e2"
    }
  ]
}
```

## Frontend Display Logic

### Simple Display (Just show the price field)
```jsx
<Text>{fruit.price}{fruit.unit}</Text>
// Displays: "Rs. 100.00-150.00 / kg" or "Rs. 80.00 / kg"
```

### Advanced Display (Show range separately)
```jsx
{fruit.priceRange ? (
  <View>
    <Text>Price Range: Rs. {fruit.priceRange.min} - Rs. {fruit.priceRange.max}</Text>
    <Text style={styles.subtext}>Average: Rs. {fruit.avgPrice}</Text>
  </View>
) : (
  <Text>Price: {fruit.price}</Text>
)}
```

### Chart/Graph Display
Use `avgPrice` for plotting on charts:
```jsx
const chartData = fruits.map(f => ({
  label: f.name,
  value: f.avgPrice,
  minValue: f.priceRange?.min || f.avgPrice,
  maxValue: f.priceRange?.max || f.avgPrice
}));
```

## Other Endpoints Updated

### GET /api/farmer/prices/daily-v2
Returns same format as `/live-market`

### GET /api/admin/economic-center/prices
Returns full database records including:
```json
{
  "id": "uuid",
  "fruit_name": "Mango",
  "price_per_unit": 125,
  "min_price": 100,
  "max_price": 150,
  "unit": "kg",
  "currency": "LKR"
}
```

## Styling Recommendations

### Price Range Badge
```jsx
const PriceRangeBadge = ({ fruit }) => {
  if (!fruit.priceRange) {
    return <Text style={styles.singlePrice}>{fruit.price}</Text>;
  }
  
  return (
    <View style={styles.rangeContainer}>
      <Text style={styles.rangeText}>{fruit.price}</Text>
      <Text style={styles.avgText}>avg: Rs. {fruit.avgPrice.toFixed(2)}</Text>
    </View>
  );
};
```

### Color Coding by Status
```jsx
const getPriceColor = (status) => {
  switch(status) {
    case 'High': return '#ef4444';
    case 'Medium': return '#f59e0b';
    case 'Low': return '#10b981';
    default: return '#6b7280';
  }
};

<Text style={{ color: getPriceColor(fruit.status) }}>
  {fruit.price}
</Text>
```

## Migration Note
After running the database migration, **all existing prices will have min_price and max_price set to price_per_unit**, meaning:
- Old data shows as single prices (min = max)
- New scraped data shows as ranges when available
- Your frontend code works for both cases

## Testing
Test with these scenarios:
1. Single price: `priceRange` is `null`
2. Price range: `priceRange` is `{ min: 100, max: 150 }`
3. No data: `price` is `"N/A"`
