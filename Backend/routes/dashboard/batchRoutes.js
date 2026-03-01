/**
 * batchRoutes.js
 * Routes for batch-related dashboard endpoints
 */

const express = require("express");
const router = express.Router();
const batchController = require("../../controllers/dashboard/batchController");

// Get batch details by ID
router.get("/:id", batchController.getBatchDetails);

// Get list of batches
router.get("/", batchController.getBatchList);

// Search batches
router.get("/search", batchController.searchBatches);

// Get batch count by status
router.get("/count-by-status", batchController.getBatchCountByStatus);

// Get recent batches
router.get("/recent", batchController.getRecentBatches);

module.exports = router;
