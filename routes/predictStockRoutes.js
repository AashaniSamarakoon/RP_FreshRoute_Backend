const express = require("express");
const router = express.Router();
const { submitPredictStock } = require("../controllers/predictStockController");

// POST /predictStock - submit new predict stock entry
router.post("/", submitPredictStock);

module.exports = router;
