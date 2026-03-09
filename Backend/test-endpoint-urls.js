#!/usr/bin/env node
/**
 * SMS Endpoint URL Tester
 * Tests both local and production endpoints to find which one is working
 */

const http = require('http');
const https = require('https');

const ENDPOINTS = {
  local: {
    protocol: http,
    hostname: '127.0.0.1',
    port: 4000,
    baseUrl: 'http://127.0.0.1:4000'
  },
  production: {
    protocol: https,
    hostname: 'kenneth-unprevaricating-nonrevoltingly.ngrok-free.dev',
    port: 443,
    baseUrl: 'https://kenneth-unprevaricating-nonrevoltingly.ngrok-free.dev'
  }
};

async function testAllEndpoints() {
  console.log('🌐 SMS Endpoint URL Tester');
  console.log('==========================\n');

  for (const [name, config] of Object.entries(ENDPOINTS)) {
    console.log(`Testing ${name} server (${config.baseUrl}):`);

    try {
      const result = await testEndpoint(config, '/api/farmer/sms/preferences');
      console.log(`  Status: ${result.status}`);

      if (result.status === 200) {
        console.log('  ✅ Endpoint working with valid authentication');
      } else if (result.status === 401) {
        console.log('  ✅ Endpoint exists (authentication required)');
      } else if (result.status === 404) {
        console.log('  ❌ Endpoint not found - needs deployment');
      } else if (result.status === 'error') {
        console.log(`  ❌ Connection error: ${result.error}`);
      } else if (result.status === 'timeout') {
        console.log('  ❌ Connection timeout');
      } else {
        console.log(`  ⚠️  Unexpected status: ${result.status}`);
      }
    } catch (error) {
      console.log(`  ❌ Test failed: ${error.message}`);
    }

    console.log('');
  }

  console.log('💡 Recommendations:');
  console.log('- If local works but production doesn\'t: Deploy backend files to production');
  console.log('- If both work: Use the one that matches your current setup');
  console.log('- If neither work: Check server status and configuration');
}

function testEndpoint(config, path) {
  return new Promise((resolve) => {
    const options = {
      hostname: config.hostname,
      port: config.port,
      path: path,
      method: 'GET',
      headers: {
        'Authorization': 'Bearer test_token',
        'Content-Type': 'application/json'
      }
    };

    const req = config.protocol.request(options, (res) => {
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

    req.setTimeout(10000, () => {
      req.destroy();
      resolve({ status: 'timeout' });
    });

    req.end();
  });
}

// Run the test
testAllEndpoints().catch(console.error);