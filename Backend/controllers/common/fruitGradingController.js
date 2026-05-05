// controllers/fruitGradingController.js
const fruitGradingService = require("../../Services/fruitGrading/fruitGradingService");
const logger = require("../../utils/logger").fruitGrading;

/** Map rule grade letter to legacy API labels (Grade_A, Grade_B, Grade_C). */
function letterToLegacyGradeClass(letter) {
  const L = String(letter || "").trim().toUpperCase();
  if (L === "A" || L === "B" || L === "C") return `Grade_${L}`;
  return `Grade_${letter}`;
}

/** Softmax probability (%) for the rule-based grade from the grade head. */
function confidenceForRuleBasedGrade(pred) {
  const letter = pred.gradeRuleBased;
  const entry = pred.gradeHead.probabilities.find((p) => p.className === letter);
  if (entry != null) return parseFloat(entry.probability.toFixed(2));
  return parseFloat(Number(pred.confidence).toFixed(2));
}

function gradeHeadToLegacyAllProbabilities(gradeHead) {
  return gradeHead.probabilities.map((p) => ({
    className: letterToLegacyGradeClass(p.className),
    probability: parseFloat(p.probability.toFixed(2)),
  }));
}

/**
 * Predict fruit grades for up to 5 images
 * POST /api/fruit-grading/predict
 */
const predictFruitGrades = async (req, res) => {
  const requestStartTime = Date.now();
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  try {
    logger.info("Prediction request received", {
      requestId,
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.get("user-agent"),
    });

    // Check if files are uploaded
    if (!req.files || req.files.length === 0) {
      logger.warn("Prediction request rejected: No images provided", {
        requestId,
      });
      return res.status(400).json({
        message: "No images provided. Please upload at least 1 image.",
      });
    }

    const fileCount = req.files.length;
    const fileNames = req.files.map((f) => f.originalname);
    const fileSizes = req.files.map((f) => f.size);

    logger.info("Processing prediction request", {
      requestId,
      fileCount,
      fileNames,
      totalSize: `${(fileSizes.reduce((a, b) => a + b, 0) / 1024).toFixed(2)}KB`,
    });

    // Limit to 5 images
    if (fileCount > 5) {
      logger.warn("Prediction request rejected: Too many files", {
        requestId,
        fileCount,
      });
      return res.status(400).json({
        message: "Maximum 5 images allowed per request.",
      });
    }

    // Check if model is loaded
    if (!fruitGradingService.session) {
      logger.error("Prediction request rejected: Model not loaded", {
        requestId,
      });
      return res.status(503).json({
        message: "Model not loaded. Please try again later.",
      });
    }

    // Extract image buffers
    const imageBuffers = req.files.map((file) => file.buffer);

    // Run predictions
    const predictions = await fruitGradingService.predictBatch(imageBuffers);

    const response = {
      success: true,
      count: predictions.length,
      predictions: predictions.map((pred, index) => ({
        imageIndex: index + 1,
        fileName: req.files[index].originalname,
        predictedClass: letterToLegacyGradeClass(pred.gradeRuleBased),
        confidence: confidenceForRuleBasedGrade(pred),
        allProbabilities: gradeHeadToLegacyAllProbabilities(pred.gradeHead),
      })),
    };

    const requestTime = Date.now() - requestStartTime;
    logger.info("Prediction request completed successfully", {
      requestId,
      fileCount,
      requestTime: `${requestTime}ms`,
      results: response.predictions.map((p) => ({
        fileName: p.fileName,
        predictedClass: p.predictedClass,
        confidence: p.confidence,
      })),
    });

    res.json(response);
  } catch (error) {
    const requestTime = Date.now() - requestStartTime;
    logger.error("Prediction controller error", {
      requestId,
      error: error.message,
      stack: error.stack,
      requestTime: `${requestTime}ms`,
    });
    res.status(500).json({
      message: "Failed to process images",
      error: error.message,
    });
  }
};

/**
 * Health check endpoint to verify model is loaded
 * GET /api/fruit-grading/health
 */
const healthCheck = async (req, res) => {
  try {
    const isLoaded = fruitGradingService.session !== null;
    logger.debug("Health check requested", { modelLoaded: isLoaded });
    res.json({
      status: isLoaded ? "ready" : "not_loaded",
      modelLoaded: isLoaded,
      message: isLoaded
        ? "Fruit grading service is ready"
        : "Fruit grading service is not loaded",
    });
  } catch (error) {
    logger.error("Health check error", {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
};

module.exports = {
  predictFruitGrades,
  healthCheck,
};

