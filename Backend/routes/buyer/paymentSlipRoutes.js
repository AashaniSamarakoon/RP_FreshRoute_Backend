const express = require("express");
const router = express.Router();
const multer = require("multer");
const { authMiddleware, requireRole } = require("../../Services/auth");
const { getBuyerId } = require("../../middleware/getBuyerId");
const {
  uploadPaymentSlip,
  getPaymentSlipStatus,
} = require("../../controllers/buyer/paymentSlipController");

// Configure multer for payment slip uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept only image files
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed (JPEG, PNG, etc.)"), false);
    }
  },
});

// Buyer routes (protected)
router.use(authMiddleware, requireRole("buyer"), getBuyerId);

// @route   POST /api/buyer/payment-slip/upload
// @desc    Upload payment slip for verification
// @access  Private (Buyer only)
router.post("/upload", upload.single("paymentSlip"), uploadPaymentSlip);

// @route   GET /api/buyer/payment-slip/status/:orderId
// @desc    Get payment slip verification status
// @access  Private (Buyer only)
router.get("/status/:orderId", getPaymentSlipStatus);

module.exports = router;
