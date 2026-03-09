#!/usr/bin/env node
/**
 * Login to get JWT token for API testing
 * Replace credentials with actual user details
 */

const http = require('http');

const EMAIL = 'diasnethmina0@gmail.com'; // Existing farmer email
const PASSWORD = 'YOUR_PASSWORD'; // You need to know the actual password

function login() {
  console.log('🔐 Logging in to get JWT token...');
  console.log('=================================\n');

  const postData = JSON.stringify({
    identifier: EMAIL,
    password: PASSWORD
  });

  const options = {
    hostname: 'localhost',
    port: 4000,
    path: '/api/auth/login',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
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

        if (res.statusCode === 200 && json.token) {
          console.log('\n✅ Login successful!');
          console.log('📋 JWT Token:', json.token);
          console.log('\n💡 Copy this token and replace YOUR_JWT_TOKEN_HERE in test-orders-api.js');
        }
      } catch (e) {
        console.log('Raw Response:', data);
      }
    });
  });

  req.on('error', (error) => {
    console.error('Login failed:', error.message);
  });

  req.write(postData);
  req.end();
}

login();