const express = require("express");
const router = express.Router();
const { getFruits } = require("../controllers/fruitController");

// GET /fruits - list of fruits (id, fruit_name, variant)
router.get("/", getFruits);

module.exports = router;
