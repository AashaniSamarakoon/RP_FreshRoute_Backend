const express = require("express");
const { triggerSMSNow } = require("../../services/farmer/smsScheduler");
const {
  importEconomicCenterPrices,
  getEconomicCenterPrices,
  getScrapingJobStatus,
} = require("../../controllers/admin/economicCenterController");

const router = express.Router();

// SMS management (admin only)
router.post("/sms/trigger", async (req, res) => {
  try {
    console.log("Admin: Manual SMS trigger requested");
    await triggerSMSNow();
    res.json({ message: "SMS batch sent successfully" });
  } catch (err) {
    console.error("Admin SMS trigger error", err);
    res.status(500).json({ message: "Failed to trigger SMS", error: err.message });
  }
});

// Economic center price management
router.post("/economic-center/import", importEconomicCenterPrices);
router.get("/economic-center/prices", getEconomicCenterPrices);
router.get("/scraping-jobs/:jobId", getScrapingJobStatus);

module.exports = router;
