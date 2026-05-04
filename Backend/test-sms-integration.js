#!/usr/bin/env node
/**
 * SMS Toggle Integration Test
 * Tests the complete flow: Frontend → API → Database
 */

const http = require('http');

// Configuration - Update these with your actual values
const API_BASE = 'http://127.0.0.1:4000';
const FARMER_TOKEN = process.env.FARMER_JWT_TOKEN || 'YOUR_FARMER_JWT_TOKEN_HERE';

/**
 * Simulate frontend toggle behavior
 */
async function simulateFrontendToggle() {
  console.log('🧪 SMS Toggle Integration Test');
  console.log('================================\n');

  // Step 1: Load current preference (like frontend does on page load)
  console.log('1. Loading current SMS preference...');
  const currentState = await getSMSPreference();
  if (currentState === null) return;

  console.log(`   Current state: ${currentState ? 'ENABLED' : 'DISABLED'}\n`);

  // Step 2: Toggle to opposite state (like user clicking toggle)
  const newState = !currentState;
  console.log(`2. Toggling SMS to: ${newState ? 'ENABLED' : 'DISABLED'}`);

  const updateSuccess = await updateSMSPreference(newState);
  if (!updateSuccess) return;

  // Step 3: Verify the change (like frontend reloading state)
  console.log('\n3. Verifying the change...');
  const verifiedState = await getSMSPreference();
  if (verifiedState === null) return;

  if (verifiedState === newState) {
    console.log(`   ✅ SUCCESS: SMS is now ${verifiedState ? 'ENABLED' : 'DISABLED'}`);
    console.log('   ✅ Database updated correctly!');
  } else {
    console.log(`   ❌ FAILURE: Expected ${newState}, got ${verifiedState}`);
    console.log('   ❌ Database was not updated!');
  }

  // Step 4: Toggle back to original state
  console.log('\n4. Restoring original state...');
  await updateSMSPreference(currentState);

  console.log('\n🎉 Integration test completed!');
}

/**
 * Get current SMS preference (simulates frontend loading)
 */
async function getSMSPreference() {
  try {
    const response = await makeAPIRequest('/api/farmer/sms/preferences', 'GET');

    if (response.status === 200) {
      return response.data.preferences.sms_alerts_enabled;
    } else {
      console.log(`   ❌ Failed to get preference: ${response.data}`);
      return null;
    }
  } catch (error) {
    console.log(`   ❌ Error getting preference: ${error.message}`);
    return null;
  }
}

/**
 * Update SMS preference (simulates frontend toggle)
 */
async function updateSMSPreference(enabled) {
  try {
    const response = await makeAPIRequest('/api/farmer/sms/preferences', 'PATCH', {
      sms_alerts_enabled: enabled // This must be a boolean!
    });

    if (response.status === 200) {
      console.log(`   ✅ API call successful: SMS set to ${enabled ? 'ENABLED' : 'DISABLED'}`);
      return true;
    } else {
      console.log(`   ❌ API call failed: ${JSON.stringify(response.data)}`);
      return false;
    }
  } catch (error) {
    console.log(`   ❌ Error updating preference: ${error.message}`);
    return false;
  }
}

/**
 * Make HTTP request to API
 */
function makeAPIRequest(path, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_BASE);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Authorization': `Bearer ${FARMER_TOKEN}`,
        'Content-Type': 'application/json'
      }
    };

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

// Check if token is provided
if (FARMER_TOKEN === 'YOUR_FARMER_JWT_TOKEN_HERE') {
  console.log('❌ Please set FARMER_JWT_TOKEN environment variable');
  console.log('   Example: set FARMER_JWT_TOKEN=eyJhbGciOiJIUzI1NiIs...');
  console.log('   Or edit the FARMER_TOKEN variable in this script');
  process.exit(1);
}

// Run the test
simulateFrontendToggle().catch(console.error);