const express = require("express");
const router = express.Router();
const { authMiddleware, requireRole } = require("../../Services/auth");
const {
  getProposals,
  acceptProposal,
  rejectProposal,
} = require("../../controllers/farmer/proposalController");

// All routes require farmer authentication
router.use(authMiddleware, requireRole("farmer"));

// GET /api/farmer/proposals - Get all pending proposals
router.get("/", getProposals);

// POST /api/farmer/proposals/:proposalId/accept - Accept a proposal
router.post("/:proposalId/accept", acceptProposal);

// POST /api/farmer/proposals/:proposalId/reject - Reject a proposal
router.post("/:proposalId/reject", rejectProposal);

module.exports = router;
