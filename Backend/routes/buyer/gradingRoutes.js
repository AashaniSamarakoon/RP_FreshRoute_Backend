const express = require("express");
const router = express.Router();
const {
  getGradingsByOrder,
  getAllGradings,
} = require("../../controllers/buyer/gradingController");

// GET /api/buyer/gradings/:orderId
// Get all grading images for a specific order
router.get("/:orderId", getGradingsByOrder);

// GET /api/buyer/gradings
// Get all gradings for all buyer's orders
router.get("/", getAllGradings);

module.exports = router;

