const express = require("express");
const router = express.Router();
const transporterController = require("../../controllers/transporter/transporterController");

// Matches /api/transporter/jobs
router.get("/jobs", transporterController.getMyJobs);
router.get("/jobs/:id", transporterController.getJobDetails);
router.post("/jobs/:id/action", transporterController.updateJobAction);
router.post("/location", transporterController.updateLocation);
router.get("/vehicle", transporterController.getVehicleDetails);
router.put("/jobs/:id/status", transporterController.updateJobStatus);

module.exports = router;
