// Multitask mango grading: ONNX model + rule-based grade (matches Mango-Grading-RP infer path).
const fs = require("fs");
const path = require("path");
const ort = require("onnxruntime-node");
const logger = require("../../utils/logger").fruitGrading;

const {
  loadMangoGradingConfigSync,
  prepareCleanedRgbFromBuffer,
  computeClassicalFeatures,
  classicalToFloat32Row,
  rgbToModelNchw,
} = require("./mangoMultitaskPreprocess");

const INV_GRADE = { 0: "A", 1: "B", 2: "C" };
const COLOR_LABELS = ["greenish", "mixed", "yellow"];
const SEVERITY_LABELS = ["none", "mild", "severe"];

function softmax1d(data) {
  const row = Array.isArray(data) ? data : Array.from(data);
  const max = Math.max(...row);
  const ex = row.map((x) => Math.exp(x - max));
  const s = ex.reduce((a, b) => a + b, 0);
  return ex.map((e) => e / s);
}

/**
 * Same logic as src.mango_quality.metrics.rule_based_grade_from_probs (single row).
 */
function ruleBasedGradeFromProbs(colorProbs, spotProbs, blemishProbs, thresholds) {
  const pGreenish = colorProbs[0];
  const pYellow = colorProbs[2];
  const pSevereSpot = spotProbs[2];
  const pSevereBlemish = blemishProbs[2];

  if (
    pYellow >= thresholds.yellow_min &&
    pSevereSpot < thresholds.severe_spot_max_for_a &&
    pSevereBlemish < thresholds.severe_blemish_max_for_a
  ) {
    return 0;
  }
  if (
    pGreenish >= thresholds.greenish_min_for_c ||
    pSevereSpot >= thresholds.severe_spot_min_for_c ||
    pSevereBlemish >= thresholds.severe_blemish_min_for_c
  ) {
    return 2;
  }
  return 1;
}

function headProbabilities(logitsFlat, labels) {
  const probs = softmax1d(logitsFlat);
  const predictedIndex = probs.indexOf(Math.max(...probs));
  return {
    predictedIndex,
    predictedLabel: labels[predictedIndex],
    probabilities: probs.map((p, i) => ({
      classIndex: i,
      className: labels[i],
      probability: p * 100,
    })),
  };
}

class FruitGradingService {
  constructor() {
    this.session = null;
    this.config = null;
    this.thresholds = null;
    this.aiLayerDir = path.join(__dirname, "../../..", "AI_layer", "fruit_grading");
    this.modelPath = path.join(this.aiLayerDir, "multitask_grading_model.onnx");
    this.configPath = path.join(this.aiLayerDir, "config.yaml");
    this.thresholdsPath = path.join(this.aiLayerDir, "best_rule_thresholds.json");
  }

  async loadModel() {
    try {
      const modelPath = process.env.FRUIT_GRADING_MODEL_PATH || this.modelPath;
      const configPath = process.env.FRUIT_GRADING_CONFIG_PATH || this.configPath;
      const thresholdsPath = process.env.FRUIT_GRADING_THRESHOLDS_PATH || this.thresholdsPath;

      logger.info(`Loading multitask ONNX from: ${modelPath}`);
      const startTime = Date.now();
      this.config = loadMangoGradingConfigSync(configPath);
      const threshRaw = fs.readFileSync(thresholdsPath, "utf8");
      this.thresholds = JSON.parse(threshRaw);
      this.activeThresholdsPath = thresholdsPath;

      this.session = await ort.InferenceSession.create(modelPath);
      logger.info("Multitask ONNX model loaded", {
        loadTime: `${Date.now() - startTime}ms`,
        inputNames: this.session.inputNames,
        outputNames: this.session.outputNames,
      });
      return true;
    } catch (error) {
      logger.error("Failed to load multitask ONNX model", {
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  _resolveInputNames() {
    const names = this.session.inputNames;
    if (names.length !== 2) {
      throw new Error(
        `Expected 2 ONNX inputs (image + classical_features), got ${names.length}: ${names.join(", ")}`
      );
    }
    const imageName = names.includes("input") ? "input" : names[0];
    const classicalName = names.includes("classical_features")
      ? "classical_features"
      : names.find((n) => n !== imageName) || names[1];
    return { imageName, classicalName };
  }

  async predict(imageBuffer) {
    if (!this.session || !this.config || !this.thresholds) {
      logger.error("Prediction attempted but model not loaded");
      throw new Error("Model not loaded. Call loadModel() first.");
    }

    const startTime = Date.now();
    const imageSize = this.config.training.image_size;
    const mean = this.config.preprocessing.normalize_mean;
    const std = this.config.preprocessing.normalize_std;

    try {
      const preprocessStart = Date.now();
      const { rgb, width, height } = await prepareCleanedRgbFromBuffer(imageBuffer, this.config);
      const classical = computeClassicalFeatures(rgb, width, height);
      const classicalRow = classicalToFloat32Row(classical);
      const nchw = await rgbToModelNchw(rgb, width, height, imageSize, mean, std);

      const imageTensor = new ort.Tensor("float32", nchw, [1, 3, imageSize, imageSize]);
      const classicalTensor = new ort.Tensor("float32", classicalRow, [1, 8]);

      const { imageName, classicalName } = this._resolveInputNames();
      const feeds = {
        [imageName]: imageTensor,
        [classicalName]: classicalTensor,
      };

      const inferenceStart = Date.now();
      const results = await this.session.run(feeds);
      const inferenceTime = Date.now() - inferenceStart;

      const need = ["grade", "color_stage", "spot_severity", "blemish_severity"];
      for (const k of need) {
        if (!results[k]) {
          throw new Error(
            `Missing ONNX output "${k}". Got keys: ${Object.keys(results).join(", ")}`
          );
        }
      }
      const gradeOut = results.grade;
      const colorOut = results.color_stage;
      const spotOut = results.spot_severity;
      const blemishOut = results.blemish_severity;

      const gradeLogits = Array.from(gradeOut.data);
      const colorLogits = Array.from(colorOut.data);
      const spotLogits = Array.from(spotOut.data);
      const blemishLogits = Array.from(blemishOut.data);

      const gradeIdx = gradeLogits.indexOf(Math.max(...gradeLogits));
      const colorProbs = softmax1d(colorLogits);
      const spotProbs = softmax1d(spotLogits);
      const blemishProbs = softmax1d(blemishLogits);

      const ruleIdx = ruleBasedGradeFromProbs(colorProbs, spotProbs, blemishProbs, this.thresholds);
      const gradeRuleBased = INV_GRADE[ruleIdx];
      const gradeDirect = INV_GRADE[gradeIdx];

      const gradeHead = headProbabilities(gradeLogits, ["A", "B", "C"]);
      const colorHead = headProbabilities(colorLogits, COLOR_LABELS);
      const spotHead = headProbabilities(spotLogits, SEVERITY_LABELS);
      const blemishHead = headProbabilities(blemishLogits, SEVERITY_LABELS);

      const gradeDirectConfidence = gradeHead.probabilities[gradeIdx].probability;
      const preprocessTime = Date.now() - preprocessStart;
      const totalTime = Date.now() - startTime;

      logger.debug("Multitask prediction completed", {
        gradeRuleBased,
        gradeDirect,
        preprocessTime: `${preprocessTime}ms`,
        inferenceTime: `${inferenceTime}ms`,
        totalTime: `${totalTime}ms`,
      });

      return {
        className: gradeRuleBased,
        gradeRuleBased,
        gradeDirect,
        confidence: gradeDirectConfidence,
        gradeDirectConfidence,
        gradeHead,
        colorStage: colorHead,
        spotSeverity: spotHead,
        blemishSeverity: blemishHead,
        ruleThresholdsPath: this.activeThresholdsPath,
        classicalFeatures: classical,
        timings: {
          preprocessMs: preprocessTime,
          inferenceMs: inferenceTime,
          totalMs: totalTime,
        },
      };
    } catch (error) {
      logger.error("Prediction error", {
        error: error.message,
        stack: error.stack,
        processingTime: `${Date.now() - startTime}ms`,
      });
      throw new Error(`Failed to run prediction: ${error.message}`);
    }
  }

  async predictBatch(imageBuffers) {
    const batchStartTime = Date.now();
    const imageCount = imageBuffers.length;
    logger.info(`Starting batch prediction for ${imageCount} image(s)`);

    try {
      const predictions = await Promise.all(
        imageBuffers.map((buffer, index) => {
          logger.debug(`Processing image ${index + 1}/${imageCount}`);
          return this.predict(buffer);
        })
      );

      const batchTime = Date.now() - batchStartTime;
      logger.info("Batch prediction completed", {
        imageCount,
        totalTime: `${batchTime}ms`,
        avgTimePerImage: `${(batchTime / imageCount).toFixed(2)}ms`,
        predictions: predictions.map((p) => ({
          gradeRuleBased: p.gradeRuleBased,
          gradeDirect: p.gradeDirect,
        })),
      });

      return predictions;
    } catch (error) {
      logger.error("Batch prediction failed", {
        error: error.message,
        imageCount,
        processingTime: `${Date.now() - batchStartTime}ms`,
      });
      throw error;
    }
  }

  setClasses() {
    logger.warn("setClasses is ignored for multitask grading (labels are fixed A/B/C and heads).");
  }
}

const fruitGradingService = new FruitGradingService();

module.exports = fruitGradingService;
