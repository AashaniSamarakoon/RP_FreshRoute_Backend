// routes/fruitGradingRoutes.js
const express = require("express");
const multer = require("multer");
const {
  predictFruitGrades,
  healthCheck,
} = require("../controllers/fruitGradingController");
const logger = require("../utils/logger").fruitGrading;

const router = express.Router();

// Configure multer for memory storage (max 5 files, 10MB each)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB per file
    files: 5, // Maximum 5 files
  },
  fileFilter: (req, file, cb) => {
    // Accept only image files
    const allowedMimes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
    ];
    if (allowedMimes.includes(file.mimetype)) {
      logger.debug("File accepted", {
        fileName: file.originalname,
        mimetype: file.mimetype,
        size: `${(file.size / 1024).toFixed(2)}KB`,
      });
      cb(null, true);
    } else {
      logger.warn("File rejected: Invalid file type", {
        fileName: file.originalname,
        mimetype: file.mimetype,
      });
      cb(
        new Error(
          "Invalid file type. Only JPEG, PNG, and WebP images are allowed."
        ),
        false
      );
    }
  },
});

// Health check endpoint
router.get("/health", healthCheck);

// Prediction endpoint - accepts up to 5 images
router.post(
  "/predict",
  upload.array("images", 5), // 'images' is the field name, max 5 files
  predictFruitGrades
);

module.exports = router;

