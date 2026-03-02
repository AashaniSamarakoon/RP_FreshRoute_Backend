const express = require("express");
const router = express.Router();
const { authMiddleware, requireRole } = require("../../Services/auth");
const {
  signup,
  login,
  getMe,
} = require("../../controllers/Auth/authController");
const { completeFarmerOnboarding, completeBuyerOnboarding } = require("../../controllers/Auth/onboardingController");

router.post("/signup", signup);

router.post("/login", login);
router.get("/me", authMiddleware, requireRole("transporter"), getMe);

router.put('/onboarding/farmer', authMiddleware, completeFarmerOnboarding);
router.put('/onboarding/buyer', authMiddleware, completeBuyerOnboarding);

module.exports = router;
