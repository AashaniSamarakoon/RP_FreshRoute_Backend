#!/usr/bin/env node
/**
 * Test SMS toggle with real API call
 */

const http = require('http');

// Use the token from test-notif.js (appears to be for a farmer)
const FARMER_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjVmYTZjY2ZjLWEyMWQtNDc2Yi1iOTlmLTliYzc1ZTE0NmU2OSIsImVtYWlsIjoiZmFybWVyQHRlc3QuY29tIiwicm9sZSI6ImZhcm1lciIsIm5hbWUiOiJUZXN0IEZhcm1lciIsImlhdCI6MTc2NzU4OTM5NiwiZXhwIjoxNzY4MTk0MTk2fQ.kS0vhLrz9cqmqSguRczQVeRON3ji6_blugcGl9Up234';

function makeAPIRequest(path, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: '127.0.0.1',
      port: 4000,
      path: path,
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

async function testSMSToggle() {
  console.log('🧪 Testing SMS Toggle API\n');

  try {
    // 1. Get current SMS preferences
    console.log('1. Getting current SMS preferences...');
    const getResponse = await makeAPIRequest('/api/farmer/sms/preferences');
    console.log(`   Status: ${getResponse.status}`);

    if (getResponse.status === 200) {
      console.log(`   Current SMS enabled: ${getResponse.data.preferences?.sms_alerts_enabled}`);
      console.log(`   User ID: ${getResponse.data.preferences?.id}`);
    } else {
      console.log(`   Error: ${JSON.stringify(getResponse.data)}`);
      return;
    }

    const currentState = getResponse.data.preferences?.sms_alerts_enabled;
    const newState = !currentState;

    console.log(`\n2. Toggling SMS from ${currentState} to ${newState}...`);

    // 2. Toggle SMS setting to false (turn off)
    const toggleResponse = await makeAPIRequest('/api/farmer/sms/preferences', 'PATCH', {
      sms_alerts_enabled: false
    });

    console.log(`   Status: ${toggleResponse.status}`);
    if (toggleResponse.status === 200) {
      console.log(`   ✅ SMS successfully set to: ${toggleResponse.data.preferences?.sms_alerts_enabled}`);
    } else {
      console.log(`   ❌ Error: ${JSON.stringify(toggleResponse.data)}`);
    }

    // 3. Verify the change
    console.log('\n3. Verifying the change...');
    const verifyResponse = await makeAPIRequest('/api/farmer/sms/preferences');
    console.log(`   Status: ${verifyResponse.status}`);
    if (verifyResponse.status === 200) {
      const verifiedState = verifyResponse.data.preferences?.sms_alerts_enabled;
      console.log(`   Verified SMS state: ${verifiedState}`);
      if (verifiedState === false) {
        console.log('   ✅ SMS successfully turned OFF');
      } else {
        console.log('   ❌ SMS is still ON - database not updated!');
      }
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testSMSToggle();