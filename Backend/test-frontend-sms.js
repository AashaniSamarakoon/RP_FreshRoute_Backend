#!/usr/bin/env node
/**
 * Frontend SMS API Test Script
 * Run this from your frontend project to test SMS preferences API
 */

const https = require('https');
const http = require('http');

// Configuration - Update these values
const API_BASE_URL = 'https://kenneth-unprevaricating-nonrevoltingly.ngrok-free.dev'; // or your local URL
const JWT_TOKEN = 'YOUR_JWT_TOKEN_HERE'; // Replace with actual token from your app

function makeRequest(endpoint, method = 'GET', body = null) {
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

    if (body) {
      options.headers['Content-Length'] = Buffer.byteLength(JSON.stringify(body));
    }

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

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

async function testSMSAPI() {
  console.log('🧪 Frontend SMS API Test');
  console.log('========================\n');

  console.log(`Testing server: ${API_BASE_URL}`);
  console.log(`Using token: ${JWT_TOKEN.substring(0, 20)}...\n`);

  // Test 1: Get SMS preferences
  console.log('1. Testing GET /api/farmer/sms/preferences');
  try {
    const getResult = await makeRequest('/api/farmer/sms/preferences');
    console.log(`   Status: ${getResult.status}`);
    if (getResult.status === 200) {
      console.log(`   ✅ Success: ${JSON.stringify(getResult.data)}`);
    } else if (getResult.status === 401) {
      console.log(`   ❌ Auth failed: ${getResult.data?.message || getResult.raw}`);
    } else {
      console.log(`   ⚠️  Unexpected: ${getResult.raw}`);
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }

  console.log('');

  // Test 2: Update SMS preferences to true
  console.log('2. Testing PATCH /api/farmer/sms/preferences (enable)');
  try {
    const updateResult = await makeRequest('/api/farmer/sms/preferences', 'PATCH', {
      sms_alerts_enabled: true
    });
    console.log(`   Status: ${updateResult.status}`);
    if (updateResult.status === 200) {
      console.log(`   ✅ Success: ${JSON.stringify(updateResult.data)}`);
    } else if (updateResult.status === 401) {
      console.log(`   ❌ Auth failed: ${updateResult.data?.message || updateResult.raw}`);
    } else {
      console.log(`   ⚠️  Unexpected: ${updateResult.raw}`);
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }

  console.log('');

  // Test 3: Update SMS preferences to false
  console.log('3. Testing PATCH /api/farmer/sms/preferences (disable)');
  try {
    const updateResult2 = await makeRequest('/api/farmer/sms/preferences', 'PATCH', {
      sms_alerts_enabled: false
    });
    console.log(`   Status: ${updateResult2.status}`);
    if (updateResult2.status === 200) {
      console.log(`   ✅ Success: ${JSON.stringify(updateResult2.data)}`);
    } else if (updateResult2.status === 401) {
      console.log(`   ❌ Auth failed: ${updateResult2.data?.message || updateResult2.raw}`);
    } else {
      console.log(`   ⚠️  Unexpected: ${updateResult2.raw}`);
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }

  console.log('\n📋 Troubleshooting:');
  console.log('- If you get 401 "Missing token": Check JWT_TOKEN variable');
  console.log('- If you get 401 "Invalid token": Token expired, get a fresh one');
  console.log('- If you get 403: User doesn\'t have farmer role');
  console.log('- If you get connection errors: Check API_BASE_URL');
}

// Instructions
console.log('⚠️  SETUP REQUIRED:');
console.log('1. Replace YOUR_JWT_TOKEN_HERE with a valid JWT token from your app');
console.log('2. Update API_BASE_URL if using local development');
console.log('3. Run: node test-frontend-sms.js\n');

// Run test if token is configured
if (JWT_TOKEN === 'YOUR_JWT_TOKEN_HERE') {
  console.log('❌ Please configure JWT_TOKEN first');
  process.exit(1);
}

testSMSAPI().catch(console.error);