/**
 * dashboardMetaController.js
 * Controller for dashboard metadata, KPIs, and statistics
 * Handles dashboard overview, metrics, and analytics
 */

const fabricQueryService = require("../../Services/blockchain/fabricQueryService");
const batchService = require("../../Services/dashboard/batchService");
const trustService = require("../../Services/dashboard/trustService");
const { getDashboardFeatures } = require("../../utils/roleMapper");

/**
 * Get dashboard overview (KPIs and stats)
 * GET /api/dashboard/overview
 */
async function getDashboardOverview(req, res) {
  try {
    const userId = req.user.id;
    const user = req.user;

    // Get batch statistics
    const batchCounts = await batchService.getBatchCountByStatus(userId, user);

    // Get recent batches
    const recentBatches = await batchService.getRecentBatches(userId, user, 5);

    // Get trust dashboard (if user has permission)
    let trustData = null;
    if (["farmer", "buyer", "admin", "auditor"].includes(user.role)) {
      try {
        trustData = await trustService.getTrustDashboard(userId, user);
      } catch (error) {
        console.error("Error getting trust data:", error);
      }
    }

    // Get available features for this role
    const availableFeatures = getDashboardFeatures(user.role);

    res.json({
      success: true,
      data: {
        batchCounts,
        recentBatches,
        trust: trustData,
        availableFeatures,
        userRole: user.role,
      },
    });
  } catch (error) {
    console.error("Error in getDashboardOverview:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve dashboard overview",
      error: error.message,
    });
  }
}

/**
 * Get batch statistics
 * GET /api/dashboard/statistics
 */
async function getStatistics(req, res) {
  try {
    const userId = req.user.id;
    const user = req.user;

    const filters = {
      status: req.query.status,
      productType: req.query.productType,
    };

    const stats = await fabricQueryService.getBatchStatistics(userId, filters);

    res.json({
      success: true,
      data: stats,
      filters,
    });
  } catch (error) {
    console.error("Error in getStatistics:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve statistics",
      error: error.message,
    });
  }
}

/**
 * Get trust score for a specific batch
 * GET /api/dashboard/trust/:batchId
 */
async function getBatchTrustScore(req, res) {
  try {
    const { batchId } = req.params;
    const userId = req.user.id;

    const trustScore = await trustService.calculateBatchTrustScore(
      userId,
      batchId,
    );

    res.json({
      success: true,
      data: trustScore,
    });
  } catch (error) {
    console.error("Error in getBatchTrustScore:", error);
    res.status(500).json({
      success: false,
      message: "Failed to calculate trust score",
      error: error.message,
    });
  }
}

/**
 * Get trust dashboard (aggregate trust metrics)
 * GET /api/dashboard/trust
 */
async function getTrustDashboard(req, res) {
  try {
    const userId = req.user.id;
    const user = req.user;

    const trustDashboard = await trustService.getTrustDashboard(userId, user);

    res.json({
      success: true,
      data: trustDashboard,
    });
  } catch (error) {
    console.error("Error in getTrustDashboard:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve trust dashboard",
      error: error.message,
    });
  }
}

/**
 * Get verification status for a batch
 * GET /api/dashboard/verification/:batchId
 */
async function getVerificationStatus(req, res) {
  try {
    const { batchId } = req.params;
    const userId = req.user.id;

    const verificationStatus =
      await fabricQueryService.getBatchVerificationStatus(userId, batchId);

    res.json({
      success: true,
      data: verificationStatus,
    });
  } catch (error) {
    console.error("Error in getVerificationStatus:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve verification status",
      error: error.message,
    });
  }
}

/**
 * Get dashboard configuration for current user
 * GET /api/dashboard/config
 */
async function getDashboardConfig(req, res) {
  try {
    const user = req.user;

    const availableFeatures = getDashboardFeatures(user.role);

    const config = {
      userRole: user.role,
      userName: user.name,
      userEmail: user.email,
      availableFeatures,
      viewModes: {
        canViewTechnical: ["admin", "auditor", "developer"].includes(user.role),
        canAccessExplorer: ["admin", "auditor", "developer"].includes(
          user.role,
        ),
      },
      explorerUrl: process.env.FABRIC_EXPLORER_URL || "http://localhost:8080",
    };

    res.json({
      success: true,
      data: config,
    });
  } catch (error) {
    console.error("Error in getDashboardConfig:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve dashboard configuration",
      error: error.message,
    });
  }
}

module.exports = {
  getDashboardOverview,
  getStatistics,
  getBatchTrustScore,
  getTrustDashboard,
  getVerificationStatus,
  getDashboardConfig,
};
