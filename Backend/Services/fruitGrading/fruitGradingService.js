// services/fruitGradingService.js
const ort = require("onnxruntime-node");
const sharp = require("sharp");
const path = require("path");
const logger = require("../../utils/logger").fruitGrading;

// ImageNet normalization constants (used during training)
const IMAGENET_MEAN = [0.485, 0.456, 0.406];
const IMAGENET_STD = [0.229, 0.224, 0.225];
const IMG_SIZE = 224;

// Default class mapping (update if you have metadata.json)
// Based on typical fruit grading: Grade_A, Grade_B, Grade_C or similar
const DEFAULT_CLASSES = {
  0: "Grade_A",
  1: "Grade_B",
  2: "Grade_C",
};

class FruitGradingService {
  constructor() {
    this.session = null;
    this.classes = DEFAULT_CLASSES;
    this.modelPath = path.join(
      __dirname,
      "..",
      "AI_layer",
      "fruit_grading",
      "best_mango_mobilenetv3.onnx"
    );
  }

  /**
   * Load ONNX model on server startup
   */
  async loadModel() {
    try {
      logger.info(`Loading ONNX model from: ${this.modelPath}`);
      const startTime = Date.now();
      this.session = await ort.InferenceSession.create(this.modelPath);
      const loadTime = Date.now() - startTime;
      logger.info("ONNX model loaded successfully", {
        loadTime: `${loadTime}ms`,
        inputNames: this.session.inputNames,
        outputNames: this.session.outputNames,
      });
      return true;
    } catch (error) {
      logger.error("Failed to load ONNX model", {
        error: error.message,
        stack: error.stack,
        modelPath: this.modelPath,
      });
      throw error;
    }
  }

  /**
   * Preprocess image: resize to 224x224, normalize, convert to tensor
   */
  async preprocessImage(imageBuffer) {
    try {
      // Resize and convert to RGB (3 channels)
      const image = await sharp(imageBuffer)
        .resize(IMG_SIZE, IMG_SIZE, {
          fit: "fill",
          background: { r: 0, g: 0, b: 0 },
        })
        .removeAlpha() // Ensure no alpha channel
        .raw()
        .toBuffer({ resolveWithObject: true });

      const { data, info } = image;
      const { width, height, channels } = info;

      // Ensure we have exactly 3 channels (RGB)
      if (channels !== 3) {
        throw new Error(`Expected 3 channels (RGB), got ${channels}`);
      }

      // Convert to float32 array and normalize
      const float32Data = new Float32Array(width * height * channels);

      // Normalize: (pixel / 255.0 - mean) / std
      for (let i = 0; i < data.length; i += channels) {
        const r = data[i] / 255.0;
        const g = data[i + 1] / 255.0;
        const b = data[i + 2] / 255.0;

        // Apply normalization
        float32Data[i] = (r - IMAGENET_MEAN[0]) / IMAGENET_STD[0];
        float32Data[i + 1] = (g - IMAGENET_MEAN[1]) / IMAGENET_STD[1];
        float32Data[i + 2] = (b - IMAGENET_MEAN[2]) / IMAGENET_STD[2];
      }

      // Convert to NCHW format (1, 3, 224, 224)
      const tensorData = new Float32Array(1 * 3 * IMG_SIZE * IMG_SIZE);
      let idx = 0;

      // Separate R, G, B channels
      for (let c = 0; c < 3; c++) {
        for (let h = 0; h < IMG_SIZE; h++) {
          for (let w = 0; w < IMG_SIZE; w++) {
            const pixelIdx = (h * IMG_SIZE + w) * channels + c;
            tensorData[idx++] = float32Data[pixelIdx];
          }
        }
      }

      return new ort.Tensor("float32", tensorData, [1, 3, IMG_SIZE, IMG_SIZE]);
    } catch (error) {
      logger.error("Image preprocessing error", {
        error: error.message,
        stack: error.stack,
      });
      throw new Error(`Failed to preprocess image: ${error.message}`);
    }
  }

  /**
   * Run inference on a single image
   */
  async predict(imageBuffer) {
    if (!this.session) {
      logger.error("Prediction attempted but model not loaded");
      throw new Error("Model not loaded. Call loadModel() first.");
    }

    const startTime = Date.now();
    try {
      // Preprocess image
      const preprocessStart = Date.now();
      const inputTensor = await this.preprocessImage(imageBuffer);
      const preprocessTime = Date.now() - preprocessStart;

      // Run inference
      const inferenceStart = Date.now();
      const inputName = this.session.inputNames[0];
      const feeds = { [inputName]: inputTensor };
      const results = await this.session.run(feeds);
      const inferenceTime = Date.now() - inferenceStart;

      // Get output
      const outputName = this.session.outputNames[0];
      const output = results[outputName];

      // Convert to JavaScript array
      const predictions = Array.from(output.data);

      // Get predicted class and confidence
      const maxIndex = predictions.indexOf(Math.max(...predictions));
      const confidence = predictions[maxIndex];
      const className = this.classes[maxIndex] || `Class_${maxIndex}`;

      // Apply softmax to get probabilities
      const expScores = predictions.map((x) => Math.exp(x));
      const sumExp = expScores.reduce((a, b) => a + b, 0);
      const probabilities = expScores.map((x) => x / sumExp);
      const confidencePercent = probabilities[maxIndex] * 100;

      const totalTime = Date.now() - startTime;

      logger.debug("Prediction completed", {
        className,
        confidence: confidencePercent.toFixed(2),
        preprocessTime: `${preprocessTime}ms`,
        inferenceTime: `${inferenceTime}ms`,
        totalTime: `${totalTime}ms`,
      });

      return {
        classIndex: maxIndex,
        className: className,
        confidence: confidencePercent,
        probabilities: probabilities.map((prob, idx) => ({
          classIndex: idx,
          className: this.classes[idx] || `Class_${idx}`,
          probability: prob * 100,
        })),
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

  /**
   * Predict multiple images
   */
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
          className: p.className,
          confidence: p.confidence.toFixed(2),
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

  /**
   * Update class mapping (if metadata.json is available)
   */
  setClasses(classes) {
    this.classes = classes;
  }
}

// Singleton instance
const fruitGradingService = new FruitGradingService();

module.exports = fruitGradingService;

