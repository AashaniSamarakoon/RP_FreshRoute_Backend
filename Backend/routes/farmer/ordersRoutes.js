const express = require('express');
const router = express.Router();
const { getFarmerOrdersOverview, getFarmerProfile, updateFarmerUserProfile, getFarmerComplaints, getFarmerComplaintDetails } = require('../../controllers/farmer/farmerController');

router.get('/orders/overview', getFarmerOrdersOverview);
router.get('/profile', getFarmerProfile);
router.put('/profile', updateFarmerUserProfile);
router.get('/complaints', getFarmerComplaints);
router.get('/complaints/:id', getFarmerComplaintDetails);

module.exports = router;