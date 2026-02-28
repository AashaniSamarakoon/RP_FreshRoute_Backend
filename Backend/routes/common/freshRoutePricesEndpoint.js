/**
 * Routes for FreshRoute Graded Prices
 */
const express = require("express");
const router = express.Router();
const { getFreshRoutePrices } = require("../../controllers/common/freshRoutePricesController");

router.get("/", getFreshRoutePrices);

module.exports = router;
