const express = require("express");
const router = express.Router();
const { authMiddleware, requireRole } = require("../../Services/auth");
const {
  getProposals,
  acceptProposal,
  rejectProposal,
} = require("../../controllers/farmer/proposalController");
const {
  getProposalsByBuyerId,
  getProposalsByFarmerId,
} = require("../../controllers/buyer/matchingController");

// All routes require farmer authentication
router.use(authMiddleware, requireRole("farmer"));

// POST /api/farmer/proposals/:proposalId/accept - Accept a proposal
router.post("/:proposalId/accept", acceptProposal);

// POST /api/farmer/proposals/:proposalId/reject - Reject a proposal
router.post("/:proposalId/reject", rejectProposal);

// GET /api/farmer/proposals/buyer/:buyerId - Get proposals for a specific buyer
router.get("/buyer/:buyerId", getProposalsByBuyerId);

// GET /api/farmer/proposals/farmer/:farmerId - Get proposals for a specific farmer
router.get("/farmer/:farmerId", getProposalsByFarmerId);

// GET /api/farmer/proposals - Get all pending proposals for authenticated farmer
router.get("/", getProposals);

module.exports = router;
