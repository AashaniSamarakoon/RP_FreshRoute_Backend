// scripts/mockSensor.js
const axios = require("axios"); // Install axios if you haven't: npm install axios

// CONFIGURATION
const BACKEND_URL = "http://localhost:4000"; // Your API URL
const VEHICLE_ID = "597ccc12-17d0-4a5e-ae5d-19f64be08b6b"; // Check your DB for a valid vehicle ID

// SIMULATION SETTINGS
let currentTemp = 40; // Start at 25°C
const TARGET_TEMP = 28; // The "weather" is trying to push it to 28
const COOLING_ON = true; // Is the AC working?

function simulateSensor() {
  // 1. Fluctuate Temperature
  // If cooling is on, temp tries to drop. If off, it rises to ambient.
  const randomFlux = (Math.random() - 0.5) * 0.5; // Change by +/- 0.25 degrees

  if (COOLING_ON) {
    // Cooling pushes temp down towards 13°C (Optimal for Mango)
    if (currentTemp > 13) currentTemp -= 0.3;
  } else {
    // Heat pushes temp up
    currentTemp += 0.2;
  }

  // Add noise
  currentTemp += randomFlux;

  // Round to 1 decimal
  currentTemp = Math.round(currentTemp * 10) / 10;

  const payload = {
    vehicle_id: VEHICLE_ID,
    temp: currentTemp,
    humidity: Math.floor(Math.random() * (70 - 50) + 50), // Random humidity 50-70%
  };

  // 2. Send Data
  console.log(`[SENSOR] Sending: ${payload.temp}°C...`);

  axios
    .post(`${BACKEND_URL}/api/telemetry/update`, payload)
    .then((res) => {
      console.log(`   -> Server: ${res.data.status}`);
    })
    .catch((err) => {
      console.error(`   -> Error: ${err.message}`);
    });
}

// Run every 5 seconds
console.log(`Starting Virtual Sensor for Vehicle: ${VEHICLE_ID}`);
setInterval(simulateSensor, 5000);
