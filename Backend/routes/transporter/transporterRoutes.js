const express = require("express");
const router = express.Router();
const transporterController = require("../../controllers/transporter/transporterController");
const deliveryController = require("../../controllers/transporter/deliveryController");

// Matches /api/transporter/jobs
router.get("/jobs", transporterController.getMyJobs);
router.get("/jobs/:id", transporterController.getJobDetails);
router.post("/jobs/:id/action", transporterController.updateJobAction);
router.post("/location", transporterController.updateLocation);
router.get("/vehicle", transporterController.getVehicleDetails);
router.put("/jobs/:id/status", transporterController.updateJobStatus);

// financial endpoints
router.get("/orders/:orderId/price", deliveryController.getFinalPrice);
// transporters hit this when they actually pick up goods
router.post("/pickup/delivery", deliveryController.pickupDelivery);
// legacy endpoint kept for backward compatibility
router.post("/pickup/charge", deliveryController.processPickupPayment);

module.exports = router;
