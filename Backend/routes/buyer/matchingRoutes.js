const express = require("express");
const router = express.Router();
const { authMiddleware, requireRole } = require("../../Services/auth");
const {
  getProposalsForOrder,
  getAllProposals,
  getProposalsByBuyerId,
  getProposalsByFarmerId,
  triggerMatching,
  approveProposal,
} = require("../../controllers/buyer/matchingController");

// All routes require buyer authentication
router.use(authMiddleware, requireRole("buyer"));

// POST /api/buyer/matching/approve/:proposalId - Buyer approves a proposal
router.post("/approve/:proposalId", approveProposal);

// POST /api/buyer/matching/trigger/:orderId - Trigger matching algorithm for an order
router.post("/trigger/:orderId", triggerMatching);

// GET /api/buyer/matching/buyer/:buyerId - Get all proposals for a specific buyer ID
// Accepts either the internal buyer PK *or* the Supabase user UUID thanks
// to resolveBuyerId(). Clients can freely send user IDs without having to
// cache the secondary buyer_idx.
router.get("/buyer/:buyerId", getProposalsByBuyerId);

// Convenience route that makes the intent explicit from the client side.
// GET /api/buyer/matching/user/:userId
router.get("/user/:userId", getProposalsByBuyerId);

// GET /api/buyer/matching/farmer/:farmerId - Get all proposals for a specific farmer ID
router.get("/farmer/:farmerId", getProposalsByFarmerId);

// GET /api/buyer/matching/:orderId - Get all proposals for a specific order
router.get("/:orderId", getProposalsForOrder);

// GET /api/buyer/matching - Get all active proposals across all buyer's orders
router.get("/", getAllProposals);

module.exports = router;
