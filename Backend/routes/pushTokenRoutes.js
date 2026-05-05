const express = require("express");
const { savePushToken } = require("../controllers/pushTokenController");

const router = express.Router();

router.post("/", savePushToken);

module.exports = router;
