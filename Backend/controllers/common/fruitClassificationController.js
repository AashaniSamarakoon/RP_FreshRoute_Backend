// controllers/common/fruitClassificationController.js
const fruitClassificationService = require("../../Services/fruitGrading/fruitClassificationService");
const logger = require("../../utils/logger").fruitGrading;

/**
 * Fruit classification only (fruit vs not fruit)
 * POST /api/fruit-classification/predict
 * Roles: buyer, transporter
 */
const predictFruitClassification = async (req, res) => {
  const requestStartTime = Date.now();
  const requestId = `fruit_cls_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  try {
    logger.info("Fruit classification request received", {
      requestId,
      ip: req.ip || req.connection?.remoteAddress,
    });

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        message: "No images provided. Please upload at least 1 image.",
      });
    }

    const fileCount = req.files.length;
    if (fileCount > 5) {
      return res.status(400).json({
        message: "Maximum 5 images allowed per request.",
      });
    }

    if (!fruitClassificationService.session) {
      return res.status(503).json({
        message: "Fruit classification model not loaded. Please try again later.",
      });
    }

    const imageBuffers = req.files.map((file) => file.buffer);
    const predictions = await fruitClassificationService.classifyBatch(imageBuffers);

    const response = {
      success: true,
      count: predictions.length,
      predictions: predictions.map((pred, index) => ({
        imageIndex: index + 1,
        fileName: req.files[index].originalname,
        isFruit: pred.isFruit,
        confidence: parseFloat(pred.confidence.toFixed(2)),
        label: pred.isFruit ? "Fruit" : "Not a fruit",
      })),
    };

    logger.info("Fruit classification prediction result", {
      requestId,
      fileCount,
      requestTime: `${Date.now() - requestStartTime}ms`,
      results: response.predictions,
    });

    res.json(response);
  } catch (error) {
    logger.error("Fruit classification controller error", {
      requestId,
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({
      message: "Failed to process images",
      error: error.message,
    });
  }
};

/**
 * Health check for fruit classification model
 * GET /api/fruit-classification/health
 */
const healthCheck = async (req, res) => {
  try {
    const modelLoaded = fruitClassificationService.session !== null;
    res.json({
      status: modelLoaded ? "ready" : "not_loaded",
      modelLoaded,
      message: modelLoaded
        ? "Fruit classification service is ready"
        : "Fruit classification model is not loaded",
    });
  } catch (error) {
    logger.error("Fruit classification health check error", {
      error: error.message,
    });
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
};

module.exports = {
  predictFruitClassification,
  healthCheck,
};
