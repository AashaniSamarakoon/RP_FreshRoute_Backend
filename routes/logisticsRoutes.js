// routes/logisticsRoutes.js
const express = require("express");
const router = express.Router();
const logisticsController = require("../controllers/logisticsController");
const batchController = require("../controllers/batchController");

// Route to run daily batch processing
router.post("/daily-batch", batchController.runDailyBatch);

router.post("/assign", logisticsController.assignVehicleToOrder);

module.exports = router;
