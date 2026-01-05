const express = require("express");
const router = express.Router();
const { authMiddleware, requireRole } = require("../../Services/auth");
const {
  signup,
  login,
  getMe,
} = require("../../controllers/Auth/authController");

router.post("/signup", signup);
router.post("/login", login);
router.get("/me", authMiddleware, requireRole("transporter"), getMe);

module.exports = router;
