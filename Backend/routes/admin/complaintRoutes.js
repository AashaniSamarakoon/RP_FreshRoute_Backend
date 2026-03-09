const express = require("express");
const router = express.Router();
const { authMiddleware, requireRole } = require("../../Services/auth");
const {
  getAllComments,
  getComplaints,
  getComplaintById,
  setComplaintResolved,
  updateComplaint,
} = require("../../controllers/admin/complaintController");

router.use(authMiddleware);
router.use(requireRole("admin"));

// GET /api/admin/complaints?user_id=optional – all complaints or filter by user_id
router.get("/", getComplaints);
// GET /api/admin/complaints/comments – all comments across complaints (optional ?user_id= & ?complaint_id=)
router.get("/comments", getAllComments);
// GET /api/admin/complaints/:id – one complaint by id
router.get("/:id", getComplaintById);
// PATCH /api/admin/complaints/:id/resolve – set complaint status to "resolved"
router.patch("/:id/resolve", setComplaintResolved);
// PATCH /api/admin/complaints/:id – add admin comment and/or update status. Body: { comment?, status? }. Role "admin" attached to comment.
router.patch("/:id", updateComplaint);

module.exports = router;
