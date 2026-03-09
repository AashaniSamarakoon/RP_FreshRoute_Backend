#!/usr/bin/env node
/**
 * Test SMS toggle functionality
 * This script demonstrates how to toggle SMS alerts on/off for a farmer
 */

const http = require('http');

// You'll need to replace this with a valid JWT token for a farmer user
const token = 'YOUR_FARMER_JWT_TOKEN_HERE';

const options = {
  hostname: '127.0.0.1',
  port: 4000,
  path: '/api/farmer/sms/preferences',
  method: 'PATCH',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
};

/**
 * Toggle SMS alerts on/off
 * @param {boolean} enable - true to enable, false to disable
 */
function toggleSMS(enable) {
  const req = http.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });
    res.on('end', () => {
      console.log(`Status: ${res.statusCode}`);
      try {
        const json = JSON.parse(data);
        console.log('Response:', JSON.stringify(json, null, 2));
      } catch (e) {
        console.log('Response:', data);
      }
    });
  });

  req.on('error', (error) => {
    console.error('Error:', error.message);
  });

  // Send the toggle request
  req.write(JSON.stringify({
    sms_alerts_enabled: enable
  }));

  req.end();
}

// Example usage:
// toggleSMS(true);  // Enable SMS alerts
// toggleSMS(false); // Disable SMS alerts

console.log('SMS Toggle Test Script');
console.log('======================');
console.log('');
console.log('To test SMS toggle functionality:');
console.log('1. Get a valid JWT token for a farmer user');
console.log('2. Replace YOUR_FARMER_JWT_TOKEN_HERE with the actual token');
console.log('3. Uncomment one of the toggleSMS calls below');
console.log('4. Run: node test-sms-toggle.js');
console.log('');
console.log('Example API call:');
console.log('PATCH /api/farmer/sms/preferences');
console.log('Headers: Authorization: Bearer <token>, Content-Type: application/json');
console.log('Body: { "sms_alerts_enabled": true }');
console.log('');

// Uncomment one of these to test:
// toggleSMS(true);   // Enable SMS
// toggleSMS(false);  // Disable SMS