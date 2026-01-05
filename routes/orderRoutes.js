const express = require("express");
const router = express.Router();
const { placeOrder } = require("../controllers/orderController");

// @route   POST /
// @desc    Place a new order
// @access  Private (access control is handled in index.js)
router.post("/", placeOrder);

module.exports = router;