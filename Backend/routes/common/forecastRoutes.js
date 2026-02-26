// routes/common/forecastRoutes.js
const express = require("express");
const {
  getFruitForecast,
  getForecast,
  getForecast7Day,
} = require("../../controllers/common/forecastController");

const router = express.Router();

// mount at '/api/forecast', so paths below are relative to that
router.get("/fruit", getFruitForecast);
router.get("/", getForecast);
router.get("/7day", getForecast7Day);

module.exports = router;
