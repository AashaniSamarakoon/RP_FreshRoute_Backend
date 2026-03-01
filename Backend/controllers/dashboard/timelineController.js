/**
 * timelineController.js
 * Controller for timeline-related dashboard endpoints
 * Handles product lifecycle timeline views
 */

const timelineService = require("../../Services/dashboard/timelineService");
const { determineViewMode } = require("../../utils/roleMapper");

/**
 * Get complete timeline for a batch
 * GET /api/dashboard/timeline/:batchId?view=business|technical
 */
async function getBatchTimeline(req, res) {
  try {
    const { batchId } = req.params;
    const viewMode = determineViewMode(req);
    const userId = req.user.id;

    const timeline = await timelineService.getBatchTimeline(
      userId,
      batchId,
      viewMode,
    );

    res.json({
      success: true,
      data: timeline,
      viewMode,
    });
  } catch (error) {
    console.error("Error in getBatchTimeline:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve batch timeline",
      error: error.message,
    });
  }
}

/**
 * Get timeline summary for a batch (for widgets/cards)
 * GET /api/dashboard/timeline/:batchId/summary
 */
async function getTimelineSummary(req, res) {
  try {
    const { batchId } = req.params;
    const userId = req.user.id;

    const summary = await timelineService.getTimelineSummary(userId, batchId);

    res.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    console.error("Error in getTimelineSummary:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve timeline summary",
      error: error.message,
    });
  }
}

module.exports = {
  getBatchTimeline,
  getTimelineSummary,
};
