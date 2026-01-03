const express = require("express");
const router = express.Router();
const { authMiddleware, requireRole } = require("../../Services/auth");
const {
  buyerDashboard,
} = require("../../controllers/buyer/dashboardController");

router.get("/", authMiddleware, requireRole("buyer"), buyerDashboard);

module.exports = router;
