// fruitClassificationService.js - Fruit vs not-fruit binary classifier
const ort = require("onnxruntime-node");
const sharp = require("sharp");
const path = require("path");
const logger = require("../../utils/logger").fruitGrading;

const IMAGENET_MEAN = [0.485, 0.456, 0.406];
const IMAGENET_STD = [0.229, 0.224, 0.225];
const IMG_SIZE = 224;
const FRUIT_CLASS_INDEX = 1; // 0 = not fruit, 1 = fruit

class FruitClassificationService {
  constructor() {
    this.session = null;
    this.modelPath = path.join(
      __dirname,
      "../../..",
      "AI_layer",
      "mango_classification",
      "best_mango_binary.onnx"
    );
  }

  async loadModel() {
    try {
      const overridePath = process.env.FRUIT_CLASSIFICATION_MODEL_PATH;
      const modelPath = overridePath || this.modelPath;
      logger.info(`Loading fruit classification model from: ${modelPath}`);
      const startTime = Date.now();
      this.session = await ort.InferenceSession.create(modelPath);
      logger.info("Fruit classification model loaded", {
        loadTime: `${Date.now() - startTime}ms`,
        inputNames: this.session.inputNames,
        outputNames: this.session.outputNames,
      });
      return true;
    } catch (error) {
      logger.error("Failed to load fruit classification model", {
        error: error.message,
        modelPath: this.modelPath,
      });
      throw error;
    }
  }

  async preprocessImage(imageBuffer) {
    const image = await sharp(imageBuffer)
      .resize(IMG_SIZE, IMG_SIZE, {
        fit: "fill",
        background: { r: 0, g: 0, b: 0 },
      })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { data, info } = image;
    const { width, height, channels } = info;
    if (channels !== 3) {
      throw new Error(`Expected 3 channels (RGB), got ${channels}`);
    }

    const float32Data = new Float32Array(width * height * channels);
    for (let i = 0; i < data.length; i += channels) {
      const r = data[i] / 255.0;
      const g = data[i + 1] / 255.0;
      const b = data[i + 2] / 255.0;
      float32Data[i] = (r - IMAGENET_MEAN[0]) / IMAGENET_STD[0];
      float32Data[i + 1] = (g - IMAGENET_MEAN[1]) / IMAGENET_STD[1];
      float32Data[i + 2] = (b - IMAGENET_MEAN[2]) / IMAGENET_STD[2];
    }

    const tensorData = new Float32Array(1 * 3 * IMG_SIZE * IMG_SIZE);
    let idx = 0;
    for (let c = 0; c < 3; c++) {
      for (let h = 0; h < IMG_SIZE; h++) {
        for (let w = 0; w < IMG_SIZE; w++) {
          const pixelIdx = (h * IMG_SIZE + w) * channels + c;
          tensorData[idx++] = float32Data[pixelIdx];
        }
      }
    }
    return new ort.Tensor("float32", tensorData, [1, 3, IMG_SIZE, IMG_SIZE]);
  }

  /**
   * Classify a single image. Returns { isFruit: boolean, confidence: number }.
   */
  async classify(imageBuffer) {
    if (!this.session) {
      throw new Error("Fruit classification model not loaded. Call loadModel() first.");
    }
    const inputTensor = await this.preprocessImage(imageBuffer);
    const inputName = this.session.inputNames[0];
    const results = await this.session.run({ [inputName]: inputTensor });
    const outputName = this.session.outputNames[0];
    const output = results[outputName];
    const logits = Array.from(output.data);
    const expScores = logits.map((x) => Math.exp(x));
    const sumExp = expScores.reduce((a, b) => a + b, 0);
    const probs = expScores.map((x) => x / sumExp);
    const fruitProb = probs[FRUIT_CLASS_INDEX] ?? 0;
    const isFruit = fruitProb >= 0.5;
    const confidence = (isFruit ? fruitProb : 1 - fruitProb) * 100;
    return { isFruit, confidence };
  }

  /**
   * Classify multiple images. Returns array of { isFruit, confidence }.
   */
  async classifyBatch(imageBuffers) {
    const results = [];
    for (let i = 0; i < imageBuffers.length; i++) {
      logger.debug(`Classifying image ${i + 1}/${imageBuffers.length}`);
      const result = await this.classify(imageBuffers[i]);
      results.push(result);
    }
    return results;
  }
}

const fruitClassificationService = new FruitClassificationService();
module.exports = fruitClassificationService;
