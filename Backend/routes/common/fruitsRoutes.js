const express = require("express");
const { getFruits } = require("../../controllers/common/fruitController");
const router = express.Router();

// GET /fruits - list of fruits (id, fruit_name, variant)
router.get("/", getFruits);

module.exports = router;
