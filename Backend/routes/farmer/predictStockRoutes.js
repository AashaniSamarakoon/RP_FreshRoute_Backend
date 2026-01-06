const express = require("express");
const multer = require("multer");
const {
  submitPredictStock,
  getStockById,
} = require("../../controllers/farmer/predictStockController");

const router = express.Router();

// Configure multer for memory storage (file will be in req.files array)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit per file
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"), false);
    }
  },
});

// POST /predictStock - submit new predict stock entry (with optional images)
router.post("/", upload.array("images", 10), submitPredictStock);

// GET /predictStock/:stockId - get stock by ID
router.get("/:stockId", getStockById);

module.exports = router;
