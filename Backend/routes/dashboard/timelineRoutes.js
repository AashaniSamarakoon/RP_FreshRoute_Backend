/**
 * timelineRoutes.js
 * Routes for timeline-related dashboard endpoints
 */

const express = require("express");
const router = express.Router();
const timelineController = require("../../controllers/dashboard/timelineController");

// Get complete timeline for a batch
router.get("/:batchId", timelineController.getBatchTimeline);

// Get timeline summary for a batch
router.get("/:batchId/summary", timelineController.getTimelineSummary);

module.exports = router;
