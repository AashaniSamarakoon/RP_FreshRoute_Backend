const express = require("express");
const router = express.Router();
const transporterController = require("../../controllers/transporter/transporterController");

// Matches /api/transporter/jobs
router.get("/jobs", transporterController.getMyJobs);
router.get("/jobs/:id", transporterController.getJobDetails);

module.exports = router;
