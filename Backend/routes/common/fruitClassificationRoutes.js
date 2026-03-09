// routes/common/fruitClassificationRoutes.js
const express = require("express");
const multer = require("multer");
const {
  predictFruitClassification,
  healthCheck,
} = require("../../controllers/common/fruitClassificationController");

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB per file
    files: 5,
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error("Invalid file type. Only JPEG, PNG, and WebP images are allowed."),
        false
      );
    }
  },
});

// GET /api/fruit-classification/health
router.get("/health", healthCheck);

// POST /api/fruit-classification/predict - field name "images", max 5 files
router.post("/predict", upload.array("images", 5), predictFruitClassification);

module.exports = router;
