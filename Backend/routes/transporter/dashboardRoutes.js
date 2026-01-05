const express = require("express");
const router = express.Router();
const { authMiddleware, requireRole } = require("../../Services/auth");
const {
  transporterDashboard,
} = require("../../controllers/transporter/dashboardController");

router.get(
  "/",
  authMiddleware,
  requireRole("transporter"),
  transporterDashboard
);

module.exports = router;
