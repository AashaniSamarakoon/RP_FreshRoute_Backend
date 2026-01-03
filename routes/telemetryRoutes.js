// routes/telemetryRoutes.js
const express = require("express");
const router = express.Router();
const telemetryController = require("../controllers/telemetryController");

router.post("/update", telemetryController.updateTelemetry);

module.exports = router;
