const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../../Services/auth");
const { getTrustProfile, getIdentityOnly } = require("../../controllers/common/trustController");

/**
 * @desc    Get the blockchain-verified trust profile of a user
 * @route   GET /api/trust/:role/:targetUserId
 * @access  Private (Requires valid JWT)
 * @params  role: 'farmer' or 'buyer'
 * @params  targetUserId: The ID of the user you want to inspect
 */
// router.get("/:role/:targetUserId", authMiddleware, getTrustProfile);
router.get("/test-identity/:targetUserId", getIdentityOnly);

module.exports = router;