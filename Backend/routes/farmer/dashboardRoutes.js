const express = require("express");
const router = express.Router();
const { authMiddleware, requireRole } = require("../../Services/auth");
const {
  farmerDashboard,
} = require("../../controllers/farmer/dashboardController");

router.get("/", authMiddleware, requireRole("farmer"), farmerDashboard);

module.exports = router;
