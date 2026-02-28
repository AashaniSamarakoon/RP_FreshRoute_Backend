const express = require("express");
const router = express.Router();
const { authMiddleware, requireRole } = require("../../Services/auth");
const {
  confirmDelivery,
  confirmQualityAndPickup,
  getDeliveryStatus,
} = require("../../controllers/transporter/deliveryController");

// All routes require transporter authentication
router.use(authMiddleware, requireRole("transporter"));

// @route   POST /pickup/confirm-quality-and-pickup
// @desc    Confirm quality at pickup and release payment to farmer
// @access  Private (Transporter only)
router.post("/pickup/confirm-quality-and-pickup", confirmQualityAndPickup);

// @route   POST /confirm
// @desc    Confirm order delivery to buyer
// @access  Private (Transporter only)
router.post("/confirm", confirmDelivery);

// @route   GET /status/:orderId
// @desc    Get pickup and delivery status for an order
// @access  Private (Transporter only)
router.get("/status/:orderId", getDeliveryStatus);

module.exports = router;
