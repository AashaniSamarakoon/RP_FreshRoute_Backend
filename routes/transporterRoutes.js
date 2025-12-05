const express = require("express");
const router = express.Router();
const { getCollectionJobs } = require("../controllers/transporterController");

// Route to fetch collection jobs for the transporter
router.get("/dashboard", getCollectionJobs);

module.exports = router;
