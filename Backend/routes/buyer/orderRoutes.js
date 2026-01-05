const express = require("express");
const router = express.Router();
const {
  placeOrder,
  selectFarmer,
  getOrderMatches,
  confirmMatch,
} = require("../../controllers/buyer/orderController");

// @route   POST /
// @desc    Place a new order
// @access  Private (access control is handled in index.js)
router.post("/", placeOrder);

// @route   POST /select-farmer
// @desc    Buyer selects a farmer from matches
// @access  Private
router.post("/select-farmer", selectFarmer);

// @route   GET /matches/:orderId
// @desc    Get matches for an existing order
// @access  Private
router.get("/matches/:orderId", getOrderMatches);

// @route   POST /confirm
// @desc    Legacy confirm match (blockchain lock)
// @access  Private
router.post("/confirm", confirmMatch);

module.exports = router;
