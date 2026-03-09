#!/usr/bin/env node
/**
 * SMS Backend Setup Verification
 * Run this to verify your SMS backend is properly configured
 */

const http = require('http');

async function verifySMSBackend() {
  console.log('🔍 SMS Backend Setup Verification');
  console.log('==================================\n');

  // Test 1: Check if server is running
  console.log('1. Checking if server is running...');
  const serverTest = await testEndpoint('/api/farmer/dashboard', 'GET');
  if (serverTest.status === 'error' || serverTest.status === 'timeout') {
    console.log('❌ Server is not running');
    console.log('   Start the server with: npm run dev');
    return;
  }
  console.log('✅ Server is running');

  // Test 2: Check if SMS endpoint exists
  console.log('\n2. Checking SMS endpoint...');
  const smsTest = await testEndpoint('/api/farmer/sms/preferences', 'GET');
  if (smsTest.status === 404) {
    console.log('❌ SMS endpoint not found');
    console.log('   Check if routes are properly configured');
    return;
  } else if (smsTest.status === 401) {
    console.log('✅ SMS endpoint exists and authentication is working');
  } else {
    console.log(`⚠️  Unexpected status: ${smsTest.status}`);
  }

  // Test 3: Check SMS controller
  console.log('\n3. Checking SMS controller...');
  const controllerTest = await testEndpoint('/api/farmer/sms/preferences', 'PATCH', {
    sms_alerts_enabled: true
  });
  if (controllerTest.status === 401) {
    console.log('✅ SMS controller is responding (authentication required)');
  } else if (controllerTest.status === 404) {
    console.log('❌ SMS controller not found - check controller imports');
  } else {
    console.log(`⚠️  Unexpected status: ${controllerTest.status}`);
  }

  // Test 4: Check database connection
  console.log('\n4. Checking database connection...');
  try {
    const { supabase } = require('./utils/supabaseClient');
    const { data, error } = await supabase.from('users').select('count').limit(1);
    if (error) {
      console.log('❌ Database connection failed:', error.message);
    } else {
      console.log('✅ Database connection working');
    }
  } catch (err) {
    console.log('❌ Cannot load database client');
  }

  console.log('\n🎉 Backend verification complete!');
  console.log('\n📋 Next steps:');
  console.log('1. Ensure your frontend sends valid JWT tokens');
  console.log('2. Test with a real farmer account');
  console.log('3. Check browser network tab for API calls');
  console.log('4. Monitor server logs for [SMS Update] messages');
}

function testEndpoint(path, method = 'GET', body = null) {
  return new Promise((resolve) => {
    const options = {
      hostname: '127.0.0.1',
      port: 4000,
      path: path,
      method: method,
      headers: {
        'Authorization': 'Bearer test_token',
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          data: data
        });
      });
    });

    req.on('error', (error) => {
      resolve({ status: 'error', error: error.message });
    });

    req.setTimeout(5000, () => {
      req.destroy();
      resolve({ status: 'timeout' });
    });

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

// Run verification if called directly
if (require.main === module) {
  verifySMSBackend().catch(console.error);
}

module.exports = { verifySMSBackend };