const express = require("express");
const {
  submitPredictStock,
  getStockById,
} = require("../../controllers/farmer/predictStockController");
const router = express.Router();

// POST /predictStock - submit new predict stock entry
router.post("/", submitPredictStock);

// GET /predictStock/:stockId - get stock by ID
router.get("/:stockId", getStockById);

module.exports = router;
