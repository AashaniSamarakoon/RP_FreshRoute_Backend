const express = require("express");
const {
  submitPredictStock,
} = require("../../controllers/farmer/predictStockController");
const router = express.Router();

// POST /predictStock - submit new predict stock entry
router.post("/", submitPredictStock);

module.exports = router;
