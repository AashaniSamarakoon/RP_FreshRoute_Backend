// scripts/mockSensor.js
const axios = require("axios");

// CONFIGURATION
const BACKEND_URL = "https://api.freshroute.lk";
const VEHICLE_ID = "57853edb-d7d6-494d-8033-543e7d0f01f1";

// SETTINGS
let currentTemp = 40.0;
let currentHumidity = 65.0;

// INTERVAL: 5 Minutes = 300000 ms
// For testing, you might want 5000 (5 seconds)
const SEND_INTERVAL = 20000;

function simulateSensor() {
  // 1. Simulate Temp Fluctuation (Drift)
  const tempChange = (Math.random() - 0.5) * 0.5; // +/- 0.25 deg
  currentTemp += tempChange;
  // Keep reasonable bounds
  if (currentTemp < 10) currentTemp = 10;
  if (currentTemp > 40) currentTemp = 40;

  // 2. Simulate Humidity Fluctuation
  const humChange = (Math.random() - 0.5) * 2; // +/- 1%
  currentHumidity += humChange;
  if (currentHumidity < 40) currentHumidity = 40;
  if (currentHumidity > 95) currentHumidity = 95;

  // Rounding
  const payload = {
    vehicle_id: VEHICLE_ID,
    temp: Math.round(currentTemp * 10) / 10,
    humidity: Math.round(currentHumidity * 10) / 10,
  };

  console.log(
    `[SENSOR] Sending Telemetry: ${payload.temp}°C | ${payload.humidity}%`,
  );

  axios
    .post(`${BACKEND_URL}/api/telemetry/update`, payload)
    .then((res) => console.log(`   -> Server: OK`))
    .catch((err) => console.error(`   -> Error: ${err.message}`));
}

console.log(`Starting Virtual Sensor (Interval: ${SEND_INTERVAL}ms)`);
simulateSensor();
setInterval(simulateSensor, SEND_INTERVAL);
