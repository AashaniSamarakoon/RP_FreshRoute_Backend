const express = require("express");
const multer = require("multer");
const router = express.Router();
const { authMiddleware, requireRole } = require("../../Services/auth");
const {
  createComplaint,
  getComplaintsByUser,
  getComplaintById,
  addComment,
} = require("../../controllers/buyer/complaintController");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 5 },
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Invalid file type. Only JPEG, PNG, and WebP allowed."), false);
  },
});

router.use(authMiddleware);
router.use(requireRole("buyer"));

// GET /api/buyer/complaints – all complaints for current user
router.get("/", getComplaintsByUser);
// GET /api/buyer/complaints/:id – one complaint by id (own only)
router.get("/:id", getComplaintById);
// POST /api/buyer/complaints – create complaint (multipart/form-data)
router.post("/", upload.array("images", 5), createComplaint);
// POST /api/buyer/complaints/:id/comment – add comment (body: { comment }). Role "user" attached.
router.post("/:id/comment", addComment);

module.exports = router;
