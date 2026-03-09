const express = require("express");
const multer = require("multer");
const { saveGrading } = require("../../controllers/transporter/gradingController");

const router = express.Router();

// Configure multer to parse FormData fields (not files, since images are base64 strings)
// Use .none() to parse multipart/form-data without expecting file uploads
const upload = multer({
  limits: {
    fieldSize: 50 * 1024 * 1024, // 50MB per field (base64 images can be large)
    fields: 23, // grading_id, job_id, order_id + 5 images * 4 fields each = 23 fields
  },
});

// POST /api/gradings
// Save fruit grading data with authentication and transporter role requirement
router.post("/", upload.none(), saveGrading);

module.exports = router;

