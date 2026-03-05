const express = require("express");
const router = express.Router();
const { authMiddleware, requireRole } = require("../Services/auth");
const { getBuyerId } = require("../middleware/getBuyerId");
const {
  handleNotify,
  preapprovalInit,
  preapprovalNotify,
  preapprovalForm,
  preapprovalReturn,
  generateHash,
} = require("../controllers/payhereController");

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

// POST /api/payhere/preapproval-init
router.post(
  "/preapproval-init",
  authMiddleware,
  requireRole("buyer"),
  getBuyerId,
  preapprovalInit,
);

// ── PayHere server callbacks (no auth) ───────────────────────────────────────
// POST /api/payhere/preapproval-notify
router.post("/preapproval-notify", urlEncoded, preapprovalNotify);

// POST /api/payhere/notify
router.post("/notify", urlEncoded, handleNotify);

// ── Public HTML form page (no auth) ──────────────────────────────────────────
// GET /payhere/preapproval-form/:orderId  (registered directly on app in index.js)
// Exported separately so index.js can mount it without the /api prefix.
router.get("/preapproval-form/:orderId", preapprovalForm);

// GET /payhere/preapproval-return — PayHere redirects browser here after preapproval
router.get("/preapproval-return", preapprovalReturn);

module.exports = router;
