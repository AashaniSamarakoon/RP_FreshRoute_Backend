const { SerialPort } = require("serialport");
const { ReadlineParser } = require("@serialport/parser-readline");
const axios = require("axios");

// CONFIGURATION
const BACKEND_URL = "http://localhost:4000";
const VEHICLE_ID = "597ccc12-17d0-4a5e-ae5d-19f64be08b6b"; // Same ID used in DB
const SERIAL_PORT = "COM4"; // Windows: COM3, COM4... | Mac/Linux: /dev/ttyUSB0
const BAUD_RATE = 9600;

// 1. Setup Serial Connection
const port = new SerialPort({ path: SERIAL_PORT, baudRate: BAUD_RATE });
const parser = port.pipe(new ReadlineParser({ delimiter: "\r\n" }));

console.log(`Connecting to Arduino on ${SERIAL_PORT}...`);

// 2. Listen for Data
port.on("open", () => {
  console.log("Serial Port Opened");
});

parser.on("data", (line) => {
  try {
    // Line looks like: {"temp": 24.5, "humidity": 60.2}
    const reading = JSON.parse(line);

    if (reading.error) {
      console.warn(`[ARDUINO] Sensor Error: ${reading.error}`);
      return;
    }

    console.log(
      `[REAL SENSOR] Temp: ${reading.temp}°C | Hum: ${reading.humidity}%`
    );

    // 3. Send to Backend (Same API as Virtual Sensor)
    sendTelemetry(reading.temp, reading.humidity);
  } catch (e) {
    // Sometimes serial data gets corrupted, just ignore partial lines
    // console.error("Invalid JSON from Arduino:", line);
  }
});

// Helper Function
async function sendTelemetry(temp, humidity) {
  try {
    await axios.post(`${BACKEND_URL}/api/telemetry/update`, {
      vehicle_id: VEHICLE_ID,
      temp: temp,
      humidity: humidity,
    });
    process.stdout.write(" -> Uploaded \r"); // Little trick to keep console clean
  } catch (err) {
    console.error(`Upload Failed: ${err.message}`);
  }
}

// Error Handling
port.on("error", function (err) {
  console.log("Error: ", err.message);
});
