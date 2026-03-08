const express = require("express");
const router = express.Router();
const { authMiddleware, requireRole } = require("../Services/auth");
const { getBuyerId } = require("../middleware/getBuyerId");
const { handleNotify, generateHash } = require("../controllers/payhereController");

const urlEncoded = express.urlencoded({ extended: false });

// ── Buyer-authenticated endpoints ────────────────────────────────────────────
// POST /api/payhere/hash  — get server-side hash for startPayment
router.post(
  "/hash",
  authMiddleware,
  requireRole("buyer"),
  getBuyerId,
  generateHash,
);

// ── PayHere server callbacks (no auth) ───────────────────────────────────────
// (preapproval-notify removed; no longer used)

// POST /api/payhere/notify
router.post("/notify", urlEncoded, handleNotify);

// (no public HTML form routes needed for SDK-based flow)

module.exports = router;
