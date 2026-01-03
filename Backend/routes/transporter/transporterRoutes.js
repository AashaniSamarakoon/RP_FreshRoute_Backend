const express = require("express");
const {
  getCollectionJobs,
} = require("../../controllers/transporter/transporterController");
const router = express.Router();

// Route to fetch collection jobs for the transporter
router.get("/dashboard", getCollectionJobs);

module.exports = router;
