#!/usr/bin/env node
const http = require('http');

const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjVmYTZjY2ZjLWEyMWQtNDc2Yi1iOTlmLTliYzc1ZTE0NmU2OSIsImVtYWlsIjoiZmFybWVyQHRlc3QuY29tIiwicm9sZSI6ImZhcm1lciIsIm5hbWUiOiJUZXN0IEZhcm1lciIsImlhdCI6MTc2NzU4OTM5NiwiZXhwIjoxNzY4MTk0MTk2fQ.kS0vhLrz9cqmqSguRczQVeRON3ji6_blugcGl9Up234';

const options = {
  hostname: '127.0.0.1',
  port: 4000,
  path: '/api/farmer/notifications',
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Response:');
    try {
      const json = JSON.parse(data);
      console.log(JSON.stringify(json, null, 2));
    } catch (e) {
      console.log(data);
    }
  });
});

req.on('error', (error) => {
  console.error('Error:', error.message);
});

req.end();
