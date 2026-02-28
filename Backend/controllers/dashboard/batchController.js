/**
 * batchController.js
 * Controller for batch-related dashboard endpoints
 * Handles batch explorer, details, and list views
 */

const batchService = require("../../Services/dashboard/batchService");
const { determineViewMode } = require("../../utils/roleMapper");

/**
 * Get batch details by ID
 * GET /api/dashboard/batch/:id?view=business|technical
 */
async function getBatchDetails(req, res) {
  try {
    const { id } = req.params;
    const viewMode = determineViewMode(req);
    const userId = req.user.id;
    const user = req.user;

    const batch = await batchService.getBatchDetails(
      userId,
      id,
      user,
      viewMode,
    );

    res.json({
      success: true,
      data: batch,
      viewMode,
    });
  } catch (error) {
    console.error("Error in getBatchDetails:", error);

    if (error.message.includes("Access denied")) {
      return res.status(403).json({
        success: false,
        message: error.message,
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to retrieve batch details",
      error: error.message,
    });
  }
}

/**
 * Get list of batches for the current user
 * GET /api/dashboard/batches?status=CREATED&productType=Mango&view=business
 */
async function getBatchList(req, res) {
  try {
    const viewMode = determineViewMode(req);
    const userId = req.user.id;
    const user = req.user;

    // Extract filters from query params
    const filters = {
      status: req.query.status,
      productType: req.query.productType,
    };

    const batches = await batchService.getBatchList(
      userId,
      user,
      filters,
      viewMode,
    );

    res.json({
      success: true,
      data: batches,
      count: batches.length,
      viewMode,
      filters,
    });
  } catch (error) {
    console.error("Error in getBatchList:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve batch list",
      error: error.message,
    });
  }
}

/**
 * Search batches with criteria
 * GET /api/dashboard/batches/search?batchId=B123&productType=Mango
 */
async function searchBatches(req, res) {
  try {
    const viewMode = determineViewMode(req);
    const userId = req.user.id;
    const user = req.user;

    const searchParams = {
      batchId: req.query.batchId,
      productType: req.query.productType,
      farmerId: req.query.farmerId,
      status: req.query.status,
      dateFrom: req.query.dateFrom,
      dateTo: req.query.dateTo,
    };

    const results = await batchService.searchBatches(
      userId,
      searchParams,
      user,
      viewMode,
    );

    res.json({
      success: true,
      data: results,
      count: results.length,
      viewMode,
      searchParams,
    });
  } catch (error) {
    console.error("Error in searchBatches:", error);
    res.status(500).json({
      success: false,
      message: "Failed to search batches",
      error: error.message,
    });
  }
}

/**
 * Get batch count by status
 * GET /api/dashboard/batches/count-by-status
 */
async function getBatchCountByStatus(req, res) {
  try {
    const userId = req.user.id;
    const user = req.user;

    const counts = await batchService.getBatchCountByStatus(userId, user);

    res.json({
      success: true,
      data: counts,
    });
  } catch (error) {
    console.error("Error in getBatchCountByStatus:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve batch counts",
      error: error.message,
    });
  }
}

/**
 * Get recent batches for dashboard widget
 * GET /api/dashboard/batches/recent?limit=10
 */
async function getRecentBatches(req, res) {
  try {
    const userId = req.user.id;
    const user = req.user;
    const limit = parseInt(req.query.limit) || 10;

    const batches = await batchService.getRecentBatches(userId, user, limit);

    res.json({
      success: true,
      data: batches,
      count: batches.length,
    });
  } catch (error) {
    console.error("Error in getRecentBatches:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve recent batches",
      error: error.message,
    });
  }
}

module.exports = {
  getBatchDetails,
  getBatchList,
  searchBatches,
  getBatchCountByStatus,
  getRecentBatches,
};
