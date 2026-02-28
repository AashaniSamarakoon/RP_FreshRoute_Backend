const express = require("express");
const router = express.Router();
const { authMiddleware, requireRole } = require("../../Services/auth");
const { getBuyerId } = require("../../middleware/getBuyerId");
const {
  releasePayment,
  getPaymentStatus,
} = require("../../controllers/buyer/paymentController");

// Protected buyer routes
router.use(authMiddleware);

// @route   GET /status/:orderId
// @desc    Get payment status for an order
// @access  Private (Buyer only)
router.get(
  "/status/:orderId",
  requireRole("buyer"),
  getBuyerId,
  getPaymentStatus,
);

// Protected admin routes (for manual payment release)
// @route   POST /release
// @desc    Manually release payment to farmer
// @access  Private (Admin only)
router.post("/release", requireRole("admin"), releasePayment);

module.exports = router;
