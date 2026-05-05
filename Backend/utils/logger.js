// utils/logger.js — Winston 3.x
const winston = require("winston");
const path = require("path");
const fs = require("fs");

const logsDir = path.join(__dirname, "..", "logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const fileJsonFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.json()
);

const transports = [
  new winston.transports.File({
    filename: path.join(logsDir, "combined.log"),
    maxsize: 5242880,
    maxFiles: 5,
    format: fileJsonFormat,
  }),
  new winston.transports.File({
    filename: path.join(logsDir, "error.log"),
    level: "error",
    maxsize: 5242880,
    maxFiles: 5,
    format: fileJsonFormat,
  }),
  new winston.transports.File({
    filename: path.join(logsDir, "fruit-grading.log"),
    maxsize: 5242880,
    maxFiles: 5,
    format: fileJsonFormat,
  }),
];

if (process.env.NODE_ENV !== "production") {
  transports.push(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp(),
        winston.format.printf((info) => {
          const { timestamp, level, message, module: mod, ...rest } = info;
          const meta = {};
          for (const [k, v] of Object.entries(rest)) {
            if (typeof k === "string" && !k.startsWith("Symbol")) meta[k] = v;
          }
          const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
          const modStr = mod ? ` {${mod}}` : "";
          return `${timestamp} [${level}]:${modStr} ${message}${metaStr}`;
        })
      ),
    })
  );
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  transports,
});

function createModuleLogger(moduleName) {
  const moduleLogger = {};
  ["error", "warn", "info", "verbose", "debug", "silly"].forEach((level) => {
    moduleLogger[level] = (message, meta) => {
      logger.log({
        level,
        message,
        module: moduleName,
        ...(meta || {}),
      });
    };
  });
  return moduleLogger;
}

logger.fruitGrading = createModuleLogger("fruit-grading");

module.exports = logger;
