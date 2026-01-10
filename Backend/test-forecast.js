// Test forecast API endpoint
const http = require('http');

const options = {
  hostname: 'localhost',
  port: 4000,
  path: '/api/farmer/forecast',
  method: 'GET',
  headers: {
    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjVmYTZjY2ZjLWEyMWQtNDc2Yi1iOTlmLTliYzc1ZTE0NmU2OSIsImVtYWlsIjoiZmFybWVyQHRlc3QuY29tIiwicm9sZSI6ImZhcm1lciIsIm5hbWUiOiJUZXN0IEZhcm1lciIsImlhdCI6MTczNjA1ODg2NywiZXhwIjoxNzM2NjYzNjY3fQ.bM8vK7_wG9pHqZ3jX2nR5sL1tY6uI4oP8qW0vF3xA7c'
  }
};

const req = http.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    console.log('Status Code:', res.statusCode);
    console.log('Response:');
    try {
      console.log(JSON.stringify(JSON.parse(data), null, 2));
    } catch (e) {
      console.log(data);
    }
  });
});

req.on('error', (error) => {
  console.error('Error:', error.message);
});

req.end();
