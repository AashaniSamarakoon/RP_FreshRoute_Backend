const express = require("express");
const {
  getSMSPreferences,
  updateSMSPreferences,
} = require("../controllers/farmer/smsController");

const router = express.Router();

// SMS Preferences - accessible by any authenticated user
router.get("/preferences", getSMSPreferences);
router.put("/preferences", updateSMSPreferences);

module.exports = router;