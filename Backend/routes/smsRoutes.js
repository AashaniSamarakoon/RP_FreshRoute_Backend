const express = require("express");
const {
  getSMSPreferences,
  updateSMSPreferences,
} = require("../controllers/farmer/smsController");

const router = express.Router();

// SMS Preferences - accessible by farmer users
router.get("/", getSMSPreferences);
router.put("/", updateSMSPreferences);
router.patch("/", updateSMSPreferences);

module.exports = router;