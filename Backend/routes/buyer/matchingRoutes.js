const express = require("express");
const router = express.Router();
const { authMiddleware, requireRole } = require("../../Services/auth");
const {
  getProposalsForOrder,
  getAllProposals,
  triggerMatching,
  approveProposal,
} = require("../../controllers/buyer/matchingController");

// All routes require buyer authentication
router.use(authMiddleware, requireRole("buyer"));

// POST /api/buyer/matching/approve/:proposalId - Buyer approves a proposal
router.post("/approve/:proposalId", approveProposal);

// POST /api/buyer/matching/trigger/:orderId - Trigger matching algorithm for an order
router.post("/trigger/:orderId", triggerMatching);

// GET /api/buyer/matching/:orderId - Get all proposals for a specific order
router.get("/:orderId", getProposalsForOrder);

// GET /api/buyer/matching - Get all active proposals across all buyer's orders
router.get("/", getAllProposals);

module.exports = router;
