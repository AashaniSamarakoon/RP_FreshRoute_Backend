#!/usr/bin/env node
/**
 * Farmer Orders Overview Test Script
 * Test the new /api/farmer/orders/overview endpoint
 */

const https = require('https');
const http = require('http');

// Configuration - Update these values
const API_BASE_URL = 'https://kenneth-unprevaricating-nonrevoltingly.ngrok-free.dev'; // or http://127.0.0.1:4000
const JWT_TOKEN = 'YOUR_JWT_TOKEN_HERE'; // Replace with actual farmer JWT token

function makeRequest(endpoint, method = 'GET') {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, API_BASE_URL);
    const isHttps = url.protocol === 'https:';
    const protocol = isHttps ? https : http;

    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Authorization': `Bearer ${JWT_TOKEN}`,
        'Content-Type': 'application/json'
      }
    };

    const req = protocol.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          resolve({
            status: res.statusCode,
            data: parsed,
            raw: data
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            data: null,
            raw: data
          });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.end();
  });
}

async function testOrdersOverview() {
  console.log('🧪 Farmer Orders Overview API Test');
  console.log('===================================\n');

  console.log(`Testing server: ${API_BASE_URL}`);
  console.log(`Using token: ${JWT_TOKEN.substring(0, 20)}...\n`);

  try {
    const response = await makeRequest('/api/farmer/orders/overview');

    console.log(`Status: ${response.status}`);

    if (response.status === 200) {
      console.log('✅ Success! Orders overview retrieved\n');

      const data = response.data;

      // Display overview stats
      console.log('📊 OVERVIEW STATISTICS:');
      console.log(`   Total Orders: ${data.overview?.total_orders || 0}`);
      console.log(`   Completed Orders: ${data.overview?.completed_orders || 0}`);
      console.log(`   Pending Orders: ${data.overview?.pending_orders || 0}`);
      console.log(`   Ready to Pickup: ${data.overview?.ready_to_pickup || 0}`);
      console.log(`   Total Revenue: Rs. ${data.overview?.total_revenue?.toLocaleString() || 0}`);
      console.log(`   Completion Rate: ${data.overview?.completion_rate || 0}%\n`);

      // Display recent completed orders
      if (data.completed_orders?.length > 0) {
        console.log('✅ RECENT COMPLETED ORDERS:');
        data.completed_orders.forEach(order => {
          console.log(`   ${order.fruit_type} ${order.variant} - ${order.quantity}kg (Grade ${order.grade})`);
          console.log(`   Buyer: ${order.buyer_name} - Rs. ${order.total_amount?.toLocaleString()}`);
          console.log(`   Completed: ${new Date(order.completed_at).toLocaleDateString()}\n`);
        });
      }

      // Display pending orders
      if (data.pending_orders?.length > 0) {
        console.log('⏳ PENDING ORDERS:');
        data.pending_orders.forEach(order => {
          console.log(`   ${order.fruit_type} ${order.variant} - ${order.quantity}kg (Grade ${order.grade})`);
          console.log(`   Buyer: ${order.buyer_name} - Required: ${order.required_date} (${order.status})\n`);
        });
      }

      // Display ready to pickup
      if (data.ready_to_pickup?.length > 0) {
        console.log('🚚 READY TO PICKUP:');
        data.ready_to_pickup.forEach(order => {
          console.log(`   ${order.fruit_type} ${order.variant} - ${order.quantity}kg (Grade ${order.grade})`);
          console.log(`   Buyer: ${order.buyer_name} - Location: ${order.delivery_location}\n`);
        });
      }

      // Display calendar dates
      if (data.calendar?.length > 0) {
        console.log('📅 UPCOMING ORDER DATES:');
        data.calendar.forEach(date => {
          console.log(`   ${date.date}: ${date.orders.length} orders, ${date.total_quantity}kg total`);
          console.log(`   Fruits: ${date.fruits.join(', ')}\n`);
        });
      }

      // Display recent activity
      if (data.recent_activity?.length > 0) {
        console.log('📋 RECENT ACTIVITY:');
        data.recent_activity.forEach(activity => {
          console.log(`   ${activity.fruit_type} (${activity.quantity}kg) - ${activity.status}`);
          console.log(`   Buyer: ${activity.buyer_name} - ${new Date(activity.created_at).toLocaleDateString()}\n`);
        });
      }

    } else if (response.status === 401) {
      console.log('❌ Authentication failed');
      console.log('   Message:', response.data?.message || response.raw);
      console.log('\n💡 Make sure JWT_TOKEN contains a valid farmer JWT token');
    } else if (response.status === 403) {
      console.log('❌ Access forbidden - not a farmer account');
    } else {
      console.log('❌ Unexpected response:', response.raw);
    }

  } catch (error) {
    console.log('❌ Request failed:', error.message);
  }
}

// Instructions
console.log('⚠️  SETUP REQUIRED:');
console.log('1. Replace YOUR_JWT_TOKEN_HERE with a valid JWT token from a farmer account');
console.log('2. Update API_BASE_URL if using local development');
console.log('3. Make sure the farmer has some orders in the database\n');

// Run test if token is configured
if (JWT_TOKEN === 'YOUR_JWT_TOKEN_HERE') {
  console.log('❌ Please configure JWT_TOKEN first');
  process.exit(1);
}

testOrdersOverview().catch(console.error);