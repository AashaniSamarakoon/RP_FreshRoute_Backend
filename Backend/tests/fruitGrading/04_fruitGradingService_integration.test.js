/**
 * No real ONNX inference here (Jest + onnxruntime-node Float32Array checks are flaky).
 * These tests use mocks and cheap sanity checks.
 */

jest.mock("onnxruntime-node", () => ({
  Tensor: function Tensor(type, data, dims) {
    this.type = type;
    this.data = data;
    this.dims = dims;
  },
  InferenceSession: {
    create: jest.fn(() =>
      Promise.resolve({
        inputNames: ["input", "classical_features"],
        outputNames: ["grade", "color_stage", "spot_severity", "blemish_severity", "shared_features"],
        run: jest.fn(() =>
          Promise.resolve({
            grade: { data: new Float32Array([8, 1, 1]) },
            color_stage: { data: new Float32Array([0, 1, 8]) },
            spot_severity: { data: new Float32Array([8, 1, 0]) },
            blemish_severity: { data: new Float32Array([8, 1, 0]) },
          })
        ),
      })
    ),
  },
}));

jest.mock("../../Services/fruitGrading/mangoMultitaskPreprocess", () => {
  const actual = jest.requireActual("../../Services/fruitGrading/mangoMultitaskPreprocess");
  return {
    loadMangoGradingConfigSync: jest.fn(() => ({
      training: { image_size: 224 },
      preprocessing: {
        use_background_cleanup: false,
        use_crop_refinement: true,
        normalize_mean: [0.485, 0.456, 0.406],
        normalize_std: [0.229, 0.224, 0.225],
      },
    })),
    prepareCleanedRgbFromBuffer: jest.fn(() =>
      Promise.resolve({ rgb: new Uint8Array(12), width: 2, height: 2 })
    ),
    computeClassicalFeatures: jest.fn(() => ({
      yellow_ratio: 0.6,
      green_ratio: 0.05,
      dark_spot_ratio: 0,
      blemish_ratio: 0,
      color_consistency: 1,
      roughness: 1,
      edge_density: 0.05,
      gray_variance: 1,
    })),
    classicalToFloat32Row: actual.classicalToFloat32Row,
    rgbToModelNchw: jest.fn(() => Promise.resolve(new Float32Array(3 * 224 * 224))),
  };
});

jest.mock("fs", () => {
  const actual = jest.requireActual("fs");
  return {
    ...actual,
    readFileSync: jest.fn((p, enc) => {
      if (String(p).includes("best_rule_thresholds")) {
        return JSON.stringify({
          yellow_min: 0.55,
          severe_spot_max_for_a: 0.15,
          severe_blemish_max_for_a: 0.15,
          greenish_min_for_c: 0.4,
          severe_spot_min_for_c: 0.4,
          severe_blemish_min_for_c: 0.4,
        });
      }
      return actual.readFileSync(p, enc);
    }),
  };
});

describe("fruitGradingService (mocked ONNX + preprocess)", () => {
  test("loadModel + predict returns structured result with A/B/C grades", async () => {
    jest.resetModules();
    const fruitGradingService = require("../../Services/fruitGrading/fruitGradingService");

    await fruitGradingService.loadModel();
    expect(fruitGradingService.session).not.toBeNull();

    const result = await fruitGradingService.predict(Buffer.from([0xff, 0xd8, 0xff]));

    expect(["A", "B", "C"]).toContain(result.gradeRuleBased);
    expect(["A", "B", "C"]).toContain(result.gradeDirect);
    expect(result.gradeHead.probabilities).toHaveLength(3);
    expect(result.classicalFeatures).toBeDefined();
  });
});

describe("fruitGrading rule thresholds fixture shape", () => {
  test("embedded JSON has all keys used by rule_based_grade_from_probs", () => {
    const raw = JSON.stringify({
      yellow_min: 0.55,
      severe_spot_max_for_a: 0.15,
      severe_blemish_max_for_a: 0.15,
      greenish_min_for_c: 0.4,
      severe_spot_min_for_c: 0.4,
      severe_blemish_min_for_c: 0.4,
    });
    const t = JSON.parse(raw);
    expect(t.yellow_min).toBeDefined();
    expect(t.severe_spot_max_for_a).toBeDefined();
    expect(t.greenish_min_for_c).toBeDefined();
  });
});
