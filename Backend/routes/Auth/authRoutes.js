const express = require("express");
const router = express.Router();
const { authMiddleware, requireRole } = require("../../Services/auth");
const {
  signup,
  login,
  getMe,
  getFarmerProfile,
} = require("../../controllers/Auth/authController");
const {
  completeFarmerOnboarding,
  completeBuyerOnboarding,
} = require("../../controllers/Auth/onboardingController");

router.post("/signup", signup);

router.post("/login", login);
// public "me" endpoint returns the combined profile for any authenticated user
router.get("/me", authMiddleware, getMe);

// Farmer profile endpoint - returns detailed personal + farm info
router.get("/farmer/profile", authMiddleware, requireRole("farmer"), getFarmerProfile);

router.put("/onboarding/farmer", authMiddleware, completeFarmerOnboarding);
router.put("/onboarding/buyer", authMiddleware, completeBuyerOnboarding);

module.exports = router;
