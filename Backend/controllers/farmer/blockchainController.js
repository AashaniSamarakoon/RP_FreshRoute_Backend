const queryService = require("../../Services/blockchain/fabricQueryService");

/** GET /api/farmer/blockchain/history/:stockId */
const getBatchHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const { stockId } = req.params;
    const batchId = `HARVEST_${stockId}`;

    const history = await queryService.queryBatchHistory(userId, batchId);
    return res.status(200).json({ success: true, history });
  } catch (err) {
    console.error("Blockchain History Error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/** GET /api/farmer/blockchain/verify/:stockId */
const getVerificationStatus = async (req, res) => {
  try {
    const userId = req.user.id;
    const { stockId } = req.params;
    const batchId = `HARVEST_${stockId}`;

    const status = await queryService.getBatchVerificationStatus(userId, batchId);
    return res.status(200).json({ success: true, status });
  } catch (err) {
    console.error("Blockchain Status Error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getBatchHistory, getVerificationStatus };
