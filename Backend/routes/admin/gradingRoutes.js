const express = require("express");
const multer = require("multer");
const router = express.Router();
const { authMiddleware, requireRole } = require("../../Services/auth");
const {
  verifyGrading,
  getGradingsByOrder,
  getAllGradings,
} = require("../../controllers/admin/gradingController");

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
router.use(requireRole("admin"));

// POST /api/admin/gradings/verify – 5 images + complaint_id + received_grade (multipart, same as buyer re-verification); model verifies -> verified | failed
router.post("/verify", upload.array("images", 5), verifyGrading);
// GET /api/admin/gradings – all gradings (re-verification)
router.get("/", getAllGradings);
// GET /api/admin/gradings/:orderId – gradings for a specific order
router.get("/:orderId", getGradingsByOrder);

module.exports = router;
