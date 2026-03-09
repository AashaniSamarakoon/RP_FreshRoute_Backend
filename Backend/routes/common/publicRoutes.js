const express   = require("express");
const rateLimit = require("express-rate-limit");

const { getPublicBatch, getPublicByBuyer, getPublicByFarmer } = require("../../controllers/common/publicController");
const { authMiddleware, requireRole } = require("../../Services/auth");

const router = express.Router();

// 30 requests per 60 seconds — no auth required on this endpoint
const limiter = rateLimit({
  windowMs:       60 * 1000,
  max:            30,
  standardHeaders: true,
  legacyHeaders:  false,
  message:        { error: "Too many requests. Please try again in a minute." },
});

// GET /api/public/verify/:batchId
router.get("/verify/:batchId", limiter, getPublicBatch);

// buyer/farmer-specific verification (authenticated)
router.get(
  "/verify/by-buyer/:buyerId",
  limiter,
  authMiddleware,
  requireRole("buyer"),
  getPublicByBuyer,
);
router.get(
  "/verify/by-farmer/:farmerId",
  limiter,
  authMiddleware,
  requireRole("farmer"),
  getPublicByFarmer,
);

// expose public aliases with same behavior but no auth
router.get(
  "/verify/buyer/:buyerId",
  limiter,
  getPublicByBuyer,
);
router.get(
  "/verify/farmer/:farmerId",
  limiter,
  getPublicByFarmer,
);

module.exports = router;
