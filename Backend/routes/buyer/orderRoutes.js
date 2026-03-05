const express = require("express");
const router = express.Router();
const {
  placeOrder,
  getMyOrders,
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

module.exports = router;
