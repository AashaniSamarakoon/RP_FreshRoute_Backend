/**
 * dashboardRoutes.js
 * Main dashboard routes index
 * Combines all dashboard sub-routes
 */

const express = require("express");
const router = express.Router();
const dashboardMetaController = require("../../controllers/dashboard/dashboardMetaController");

// Import sub-route modules
const batchRoutes = require("./batchRoutes");
const timelineRoutes = require("./timelineRoutes");
const searchRoutes = require("./searchRoutes");

// Dashboard overview and metadata
router.get("/overview", dashboardMetaController.getDashboardOverview);
router.get("/statistics", dashboardMetaController.getStatistics);
router.get("/config", dashboardMetaController.getDashboardConfig);

// Trust endpoints
router.get("/trust", dashboardMetaController.getTrustDashboard);
router.get("/trust/:batchId", dashboardMetaController.getBatchTrustScore);

// Verification endpoints
router.get(
  "/verification/:batchId",
  dashboardMetaController.getVerificationStatus,
);

// Sub-routes
router.use("/batch", batchRoutes);
router.use("/timeline", timelineRoutes);
router.use("/search", searchRoutes);

module.exports = router;
