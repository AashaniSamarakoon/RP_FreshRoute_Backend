const express   = require("express");
const rateLimit = require("express-rate-limit");

const { getPublicBatch } = require("../../controllers/common/publicController");

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

module.exports = router;
