/**
 * Accuracy Insights Routes
 * Endpoints for analyzing forecast accuracy against historical prices
 */

const express = require("express");
const { calculateAccuracyInsights, getFruitAccuracyDetails } = require("../../Services/farmer/accuracyInsights");

const router = express.Router();

/**
 * GET /api/farmer/accuracy/insights
 * Get overall accuracy insights for last 7 days
 * Shows overall accuracy and per-fruit accuracy
 */
router.get("/insights", async (req, res) => {
  try {
    const insights = await calculateAccuracyInsights();
    res.json(insights);
  } catch (err) {
    console.error("[Accuracy Route] Error:", err.message);
    res.status(500).json({
      error: "Failed to calculate accuracy insights",
      message: err.message,
    });
  }
});

/**
 * GET /api/farmer/accuracy/fruit/:fruitName
 * Get detailed accuracy for a specific fruit
 * @param {string} fruitName - Fruit name to analyze
 */
router.get("/fruit/:fruitName", async (req, res) => {
  try {
    const { fruitName } = req.params;
    const details = await getFruitAccuracyDetails(fruitName);
    res.json(details);
  } catch (err) {
    console.error("[Accuracy Route] Fruit accuracy error:", err.message);
    res.status(500).json({
      error: "Failed to get fruit accuracy details",
      message: err.message,
    });
  }
});

module.exports = router;
