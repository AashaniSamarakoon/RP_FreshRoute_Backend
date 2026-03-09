#!/usr/bin/env node
/**
 * Test Farmer Orders Overview API
 * Replace YOUR_JWT_TOKEN with actual token from login
 */

const http = require('http');

const TOKEN = 'YOUR_JWT_TOKEN_HERE'; // Replace with actual JWT token

function testOrdersOverview() {
  console.log('🧪 Testing Farmer Orders Overview API');
  console.log('=====================================\n');

  const options = {
    hostname: 'localhost',
    port: 4000,
    path: '/api/farmer/orders/overview',
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/json'
    }
  };

  const req = http.request(options, (res) => {
    console.log(`Status: ${res.statusCode}`);

    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
      try {
        const json = JSON.parse(data);
        console.log('Response:');
        console.log(JSON.stringify(json, null, 2));

        if (res.statusCode === 200) {
          console.log('\n✅ API is working correctly!');
          console.log(`📊 Completed Orders: ${json.completedCount || 0}`);
          console.log(`📦 Pending Orders: ${json.pendingCount || 0}`);
          console.log(`📅 Last Completed: ${json.lastCompletedDate || 'None'}`);
          console.log(`📆 Next Order: ${json.nextOrderDate || 'None'}`);
        }
      } catch (e) {
        console.log('Raw Response:', data);
      }
    });
  });

  req.on('error', (error) => {
    console.error('Request failed:', error.message);
  });

  req.end();
}

testOrdersOverview();