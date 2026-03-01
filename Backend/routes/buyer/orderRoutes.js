const express = require("express");
const router = express.Router();
const {
  placeOrder,
  selectFarmer,
  getOrderMatches,
  confirmMatch,
  getMyOrders,
  getOrderById,
  getOrderDetails,
} = require("../../controllers/buyer/orderController");

// @route   GET /
// @desc    Get all orders for buyer
// @access  Private
router.get("/", getMyOrders);

// @route   GET /:orderId
// @desc    Get single order by ID
// @access  Private
// @route   GET /details/:orderId
// @desc    Get detailed order information
// @access  Private
router.get("/details/:orderId", getOrderDetails);
// NOTE: simple `/:orderId` route removed — use `/details/:orderId` instead

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
