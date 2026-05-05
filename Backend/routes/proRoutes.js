const express = require("express");
const router = express.Router();

const { authMiddleware, requireRole } = require("../Services/auth");
const requirePro = require("../middleware/requirePro");

const {
  getProStatus,
  initProSubscription,
  handleProNotify,
  getPersonalMarketForecast,
} = require("../controllers/pro/proController");

const urlEncoded = express.urlencoded({ extended: false });

// Authenticated endpoints
router.get("/status", authMiddleware, getProStatus);
router.post("/subscribe/init", authMiddleware, initProSubscription);

// Personal forecast: farmer + pro gated
router.get(
  "/personal-market-forecast",
  authMiddleware,
  requireRole("farmer"),
  requirePro,
  getPersonalMarketForecast,
);

// PayHere callback for Pro subscription purchases (no auth)
router.post("/payhere/notify", urlEncoded, handleProNotify);

module.exports = router;
