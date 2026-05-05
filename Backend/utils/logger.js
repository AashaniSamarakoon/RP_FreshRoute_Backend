// utils/logger.js
const winston = require("winston");
const path = require("path");
const fs = require("fs");

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, "..", "logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Create logger instance for winston 2.x
const logger = new winston.Logger({
  level: process.env.LOG_LEVEL || "info",
  transports: [
    // Write all logs to combined.log
    new winston.transports.File({
      name: "combined-file",
      filename: path.join(logsDir, "combined.log"),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      timestamp: true,
      json: true
    }),
    // Write errors to error.log
    new winston.transports.File({
      name: "error-file",
      filename: path.join(logsDir, "error.log"),
      level: "error",
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      timestamp: true,
      json: true
    }),
    // Write fruit grading specific logs
    new winston.transports.File({
      name: "fruit-grading-file",
      filename: path.join(logsDir, "fruit-grading.log"),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      timestamp: true,
      json: true
    }),
  ],
});

// Add console transport in development
if (process.env.NODE_ENV !== "production") {
  logger.add(winston.transports.Console, {
    name: "console",
    timestamp: true,
    colorize: true,
    prettyPrint: true
  });
}

function createModuleLogger(moduleName) {
  const moduleLogger = {};

  ["error", "warn", "info", "verbose", "debug", "silly"].forEach((level) => {
    moduleLogger[level] = (message, meta) => {
      logger.log(level, message, Object.assign({ module: moduleName }, meta || {}));
    };
  });

  return moduleLogger;
}

// Create a module logger for fruit grading with specific context
logger.fruitGrading = createModuleLogger("fruit-grading");

module.exports = logger;

