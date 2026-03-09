# Farmer Orders Overview Frontend Integration

## API Endpoint
```
GET /api/farmer/orders/overview
Authorization: Bearer <jwt_token>
```

## Response Structure
```json
{
  "overview": {
    "total_orders": 25,
    "completed_orders": 18,
    "pending_orders": 5,
    "ready_to_pickup": 2,
    "total_revenue": 125000.50,
    "completion_rate": 72.0
  },
  "completed_orders": [
    {
      "id": "uuid",
      "fruit_type": "Mango",
      "variant": "Karuthacolomban",
      "quantity": 100,
      "grade": "A",
      "total_amount": 25000.00,
      "completed_at": "2024-03-08T10:30:00Z",
      "buyer_name": "John Doe"
    }
  ],
  "pending_orders": [
    {
      "id": "uuid",
      "fruit_type": "Banana",
      "variant": "Ambon",
      "quantity": 50,
      "grade": "B",
      "required_date": "2024-03-15",
      "status": "MATCHED",
      "buyer_name": "Jane Smith"
    }
  ],
  "ready_to_pickup": [
    {
      "id": "uuid",
      "fruit_type": "Pineapple",
      "variant": "Mauritius",
      "quantity": 75,
      "grade": "A",
      "delivery_location": "Colombo Central Market",
      "buyer_name": "Bob Wilson"
    }
  ],
  "calendar": [
    {
      "date": "2024-03-15",
      "orders": [
        {
          "id": "uuid",
          "fruit_type": "Banana",
          "variant": "Ambon",
          "quantity": 50,
          "grade": "B",
          "buyer_name": "Jane Smith",
          "status": "MATCHED"
        }
      ],
      "total_quantity": 50,
      "fruits": ["Banana"]
    }
  ],
  "recent_activity": [
    {
      "id": "uuid",
      "fruit_type": "Mango",
      "quantity": 100,
      "status": "COMPLETED",
      "created_at": "2024-03-08T09:00:00Z",
      "buyer_name": "John Doe",
      "total_amount": 25000.00
    }
  ]
}
```

## React Component Example

```jsx
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { Calendar } from 'react-native-calendars';

const FarmerOrdersOverview = () => {
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState('');

  useEffect(() => {
    fetchOrdersOverview();
  }, []);

  const fetchOrdersOverview = async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      const response = await fetch('https://your-api-url/api/farmer/orders/overview', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setOverview(data);
      }
    } catch (error) {
      console.error('Error fetching orders overview:', error);
    } finally {
      setLoading(false);
    }
  };

  const getMarkedDates = () => {
    const marked = {};
    if (overview?.calendar) {
      overview.calendar.forEach(item => {
        marked[item.date] = {
          marked: true,
          dotColor: '#4CAF50',
          selectedColor: selectedDate === item.date ? '#2196F3' : undefined
        };
      });
    }
    return marked;
  };

  const getOrdersForDate = (date) => {
    return overview?.calendar.find(item => item.date === date)?.orders || [];
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <Text>Loading orders overview...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Overview Cards */}
      <View style={styles.overviewContainer}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Total Orders</Text>
          <Text style={styles.cardValue}>{overview?.overview.total_orders}</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Completed</Text>
          <Text style={styles.cardValue}>{overview?.overview.completed_orders}</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Pending</Text>
          <Text style={styles.cardValue}>{overview?.overview.pending_orders}</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Ready to Pickup</Text>
          <Text style={styles.cardValue}>{overview?.overview.ready_to_pickup}</Text>
        </View>
      </View>

      {/* Revenue and Completion Rate */}
      <View style={styles.statsContainer}>
        <Text style={styles.statsText}>
          Total Revenue: Rs. {overview?.overview.total_revenue?.toLocaleString()}
        </Text>
        <Text style={styles.statsText}>
          Completion Rate: {overview?.overview.completion_rate}%
        </Text>
      </View>

      {/* Calendar */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Order Calendar</Text>
        <Calendar
          markedDates={getMarkedDates()}
          onDayPress={(day) => setSelectedDate(day.dateString)}
          theme={{
            todayTextColor: '#2196F3',
            selectedDayBackgroundColor: '#2196F3',
          }}
        />

        {selectedDate && getOrdersForDate(selectedDate).length > 0 && (
          <View style={styles.dateOrders}>
            <Text style={styles.dateTitle}>Orders for {selectedDate}:</Text>
            {getOrdersForDate(selectedDate).map(order => (
              <View key={order.id} style={styles.orderItem}>
                <Text>{order.fruit_type} - {order.variant}</Text>
                <Text>{order.quantity}kg - Grade {order.grade}</Text>
                <Text>Buyer: {order.buyer_name}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Recent Activity */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recent Activity</Text>
        {overview?.recent_activity.map(activity => (
          <View key={activity.id} style={styles.activityItem}>
            <Text style={styles.activityFruit}>
              {activity.fruit_type} ({activity.quantity}kg)
            </Text>
            <Text style={styles.activityStatus}>{activity.status}</Text>
            <Text style={styles.activityBuyer}>{activity.buyer_name}</Text>
            <Text style={styles.activityDate}>
              {new Date(activity.created_at).toLocaleDateString()}
            </Text>
          </View>
        ))}
      </View>

      {/* Ready to Pickup */}
      {overview?.ready_to_pickup.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Ready for Pickup</Text>
          {overview.ready_to_pickup.map(order => (
            <TouchableOpacity key={order.id} style={styles.pickupItem}>
              <Text style={styles.pickupFruit}>
                {order.fruit_type} - {order.variant} ({order.quantity}kg)
              </Text>
              <Text style={styles.pickupLocation}>{order.delivery_location}</Text>
              <Text style={styles.pickupBuyer}>{order.buyer_name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#f5f5f5',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  overviewContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  card: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 8,
    width: '48%',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  cardValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  statsContainer: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 8,
    marginBottom: 20,
  },
  statsText: {
    fontSize: 16,
    marginBottom: 8,
  },
  section: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 8,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#333',
  },
  dateOrders: {
    marginTop: 16,
    padding: 16,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
  },
  dateTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  orderItem: {
    padding: 8,
    marginBottom: 8,
    backgroundColor: 'white',
    borderRadius: 4,
  },
  activityItem: {
    padding: 12,
    marginBottom: 8,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
  },
  activityFruit: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  activityStatus: {
    fontSize: 14,
    color: '#666',
  },
  activityBuyer: {
    fontSize: 14,
  },
  activityDate: {
    fontSize: 12,
    color: '#999',
  },
  pickupItem: {
    padding: 12,
    marginBottom: 8,
    backgroundColor: '#e8f5e8',
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#4CAF50',
  },
  pickupFruit: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  pickupLocation: {
    fontSize: 14,
    color: '#666',
  },
  pickupBuyer: {
    fontSize: 14,
  },
});

export default FarmerOrdersOverview;
```

## Features Included

1. **Overview Cards**: Total orders, completed, pending, ready to pickup
2. **Statistics**: Total revenue and completion rate
3. **Order Calendar**: Interactive calendar showing upcoming order dates
4. **Recent Activity**: Last 5 orders with status
5. **Ready to Pickup**: Highlighted orders ready for pickup
6. **Date Selection**: Click calendar dates to see orders for that day

## Usage

1. Add this component to your farmer dashboard
2. Ensure you have `react-native-calendars` installed
3. Update the API URL to match your environment
4. Handle authentication token retrieval from AsyncStorage