#!/usr/bin/env node
/**
 * Comprehensive SMS Toggle Test
 * Tests the complete SMS toggle functionality
 */

const http = require('http');

// Configuration
const API_BASE = 'http://127.0.0.1:4000';
const FARMER_TOKEN = process.env.FARMER_JWT_TOKEN || 'YOUR_FARMER_JWT_TOKEN_HERE';

/**
 * Make HTTP request to API
 */
function makeRequest(path, method = 'GET', data = null, token = FARMER_TOKEN) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_BASE);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        try {
          const response = {
            status: res.statusCode,
            data: body ? JSON.parse(body) : null
          };
          resolve(response);
        } catch (e) {
          resolve({
            status: res.statusCode,
            data: body
          });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

/**
 * Test SMS toggle functionality
 */
async function testSMSToggle() {
  console.log('🧪 Testing SMS Toggle Functionality');
  console.log('=====================================\n');

  try {
    // 1. Get current SMS preferences
    console.log('1. Getting current SMS preferences...');
    const getResponse = await makeRequest('/api/farmer/sms/preferences');
    console.log(`   Status: ${getResponse.status}`);
    if (getResponse.status === 200) {
      console.log(`   Current SMS enabled: ${getResponse.data.preferences.sms_alerts_enabled}`);
      console.log(`   Phone: ${getResponse.data.preferences.phone}`);
      console.log(`   Frequency: ${getResponse.data.preferences.sms_frequency}`);
    } else {
      console.log(`   Error: ${getResponse.data}`);
      return;
    }

    const currentState = getResponse.data.preferences.sms_alerts_enabled;
    const newState = !currentState;

    console.log(`\n2. Toggling SMS from ${currentState} to ${newState}...`);

    // 2. Toggle SMS setting
    const toggleResponse = await makeRequest('/api/farmer/sms/preferences', 'PATCH', {
      sms_alerts_enabled: newState
    });

    console.log(`   Status: ${toggleResponse.status}`);
    if (toggleResponse.status === 200) {
      console.log(`   ✅ SMS successfully toggled to: ${toggleResponse.data.preferences.sms_alerts_enabled}`);
      console.log(`   Message: ${toggleResponse.data.message}`);
    } else {
      console.log(`   ❌ Error: ${JSON.stringify(toggleResponse.data)}`);
      return;
    }

    // 3. Verify the change
    console.log('\n3. Verifying the change...');
    const verifyResponse = await makeRequest('/api/farmer/sms/preferences');
    console.log(`   Status: ${verifyResponse.status}`);
    if (verifyResponse.status === 200) {
      const verifiedState = verifyResponse.data.preferences.sms_alerts_enabled;
      if (verifiedState === newState) {
        console.log(`   ✅ Verification successful: SMS is now ${verifiedState}`);
      } else {
        console.log(`   ❌ Verification failed: Expected ${newState}, got ${verifiedState}`);
      }
    } else {
      console.log(`   Error verifying: ${verifyResponse.data}`);
    }

    console.log('\n🎉 SMS Toggle Test Complete!');

  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
  }
}

/**
 * Test invalid requests
 */
async function testInvalidRequests() {
  console.log('\n🧪 Testing Invalid Requests');
  console.log('===========================\n');

  // Test with no auth token
  console.log('1. Testing without authentication...');
  try {
    const response = await makeRequest('/api/farmer/sms/preferences', 'PATCH', {
      sms_alerts_enabled: true
    }, null);
    console.log(`   Status: ${response.status} (expected: 401 or similar)`);
  } catch (error) {
    console.log(`   Error: ${error.message}`);
  }

  // Test with invalid data
  console.log('\n2. Testing with invalid data...');
  try {
    const response = await makeRequest('/api/farmer/sms/preferences', 'PATCH', {
      sms_alerts_enabled: "not_a_boolean"
    });
    console.log(`   Status: ${response.status}`);
    console.log(`   Response: ${JSON.stringify(response.data)}`);
  } catch (error) {
    console.log(`   Error: ${error.message}`);
  }

  // Test with empty body
  console.log('\n3. Testing with empty request body...');
  try {
    const response = await makeRequest('/api/farmer/sms/preferences', 'PATCH', {});
    console.log(`   Status: ${response.status}`);
    console.log(`   Response: ${JSON.stringify(response.data)}`);
  } catch (error) {
    console.log(`   Error: ${error.message}`);
  }
}

// Run tests
if (FARMER_TOKEN === 'YOUR_FARMER_JWT_TOKEN_HERE') {
  console.log('❌ Please set FARMER_JWT_TOKEN environment variable with a valid farmer JWT token');
  console.log('   Example: FARMER_JWT_TOKEN=eyJhbGciOiJIUzI1NiIs... node test-sms-toggle-comprehensive.js');
  process.exit(1);
}

testSMSToggle().then(() => {
  return testInvalidRequests();
}).then(() => {
  console.log('\n✅ All tests completed!');
});