const path = require("path");
const fs = require("fs");

const configPath = path.join(__dirname, "..", "..", "..", "AI_layer", "fruit_grading", "config.yaml");

describe("Services/fruitGrading/mangoMultitaskPreprocess", () => {
  const {
    classicalToFloat32Row,
    loadMangoGradingConfigSync,
    FEATURE_ORDER,
    computeClassicalFeatures,
  } = require("../../Services/fruitGrading/mangoMultitaskPreprocess");

  test("classicalToFloat32Row follows FEATURE_ORDER", () => {
    const classical = {
      yellow_ratio: 0.1,
      green_ratio: 0.2,
      dark_spot_ratio: 0.3,
      blemish_ratio: 0.4,
      color_consistency: 1.1,
      roughness: 2.2,
      edge_density: 3.3,
      gray_variance: 4.4,
    };
    const row = classicalToFloat32Row(classical);
    expect(row.length).toBe(8);
    for (let i = 0; i < 8; i++) {
      expect(row[i]).toBeCloseTo(classical[FEATURE_ORDER[i]], 6);
    }
  });

  test("computeClassicalFeatures returns all keys on solid color patch", () => {
    const w = 8;
    const h = 8;
    const rgb = new Uint8Array(w * h * 3);
    for (let i = 0; i < rgb.length; i += 3) {
      rgb[i] = 200;
      rgb[i + 1] = 120;
      rgb[i + 2] = 40;
    }
    const f = computeClassicalFeatures(rgb, w, h);
    expect(f).toHaveProperty("yellow_ratio");
    expect(f).toHaveProperty("green_ratio");
    expect(f).toHaveProperty("roughness");
    expect(typeof f.yellow_ratio).toBe("number");
  });

  (fs.existsSync(configPath) ? test : test.skip)(
    "loadMangoGradingConfigSync reads AI_layer config when present",
    () => {
      const cfg = loadMangoGradingConfigSync(configPath);
      expect(cfg.training.image_size).toBe(224);
      expect(cfg.preprocessing.normalize_mean).toHaveLength(3);
      expect(cfg.preprocessing.use_background_cleanup).toBeDefined();
    }
  );
});
