const { makeRes } = require("./helpers");

function mockPred(letter, probs) {
  const [a, b, c] = probs;
  return {
    gradeRuleBased: letter,
    gradeDirect: letter,
    className: letter,
    confidence: a,
    gradeDirectConfidence: a,
    gradeHead: {
      predictedIndex: ["A", "B", "C"].indexOf(letter),
      predictedLabel: letter,
      probabilities: [
        { classIndex: 0, className: "A", probability: a },
        { classIndex: 1, className: "B", probability: b },
        { classIndex: 2, className: "C", probability: c },
      ],
    },
    colorStage: { probabilities: [] },
    spotSeverity: { probabilities: [] },
    blemishSeverity: { probabilities: [] },
    classicalFeatures: {},
    ruleThresholdsPath: "/tmp",
    timings: {},
  };
}

describe("common/fruitGradingController.predictFruitGrades", () => {
  test("400 when no files", async () => {
    jest.resetModules();
    jest.doMock("../../Services/fruitGrading/fruitGradingService", () => ({
      session: {},
      predictBatch: jest.fn(),
    }));

    const { predictFruitGrades } = require("../../controllers/common/fruitGradingController");
    const req = { files: [], ip: "127.0.0.1", get: jest.fn() };
    const res = makeRes();

    await predictFruitGrades(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body.message).toMatch(/No images/i);
  });

  test("400 when more than 5 files", async () => {
    jest.resetModules();
    jest.doMock("../../Services/fruitGrading/fruitGradingService", () => ({
      session: {},
      predictBatch: jest.fn(),
    }));

    const { predictFruitGrades } = require("../../controllers/common/fruitGradingController");
    const req = {
      files: Array.from({ length: 6 }, (_, i) => ({ originalname: `${i}.jpg`, buffer: Buffer.alloc(1), size: 1 })),
      ip: "127.0.0.1",
      get: jest.fn(),
    };
    const res = makeRes();

    await predictFruitGrades(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body.message).toMatch(/Maximum 5/i);
  });

  test("503 when model session is null", async () => {
    jest.resetModules();
    jest.doMock("../../Services/fruitGrading/fruitGradingService", () => ({
      session: null,
      predictBatch: jest.fn(),
    }));

    const { predictFruitGrades } = require("../../controllers/common/fruitGradingController");
    const req = {
      files: [{ originalname: "a.jpg", buffer: Buffer.alloc(10), size: 10 }],
      ip: "127.0.0.1",
      get: jest.fn(),
    };
    const res = makeRes();

    await predictFruitGrades(req, res);

    expect(res.status).toHaveBeenCalledWith(503);
  });

  test("200 legacy shape: predictedClass Grade_*, confidence, allProbabilities", async () => {
    jest.resetModules();
    const predictBatch = jest
      .fn()
      .mockResolvedValue([mockPred("B", [20, 70.12, 9.88])]);

    jest.doMock("../../Services/fruitGrading/fruitGradingService", () => ({
      session: {},
      predictBatch,
    }));

    const { predictFruitGrades } = require("../../controllers/common/fruitGradingController");
    const req = {
      files: [{ originalname: "mango.jpg", buffer: Buffer.alloc(100), size: 100 }],
      ip: "127.0.0.1",
      get: jest.fn(() => "jest"),
    };
    const res = makeRes();

    await predictFruitGrades(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.count).toBe(1);
    const p0 = res.body.predictions[0];
    expect(p0.predictedClass).toBe("Grade_B");
    expect(p0.confidence).toBe(70.12);
    expect(p0.allProbabilities).toEqual([
      { className: "Grade_A", probability: 20 },
      { className: "Grade_B", probability: 70.12 },
      { className: "Grade_C", probability: 9.88 },
    ]);
    expect(predictBatch).toHaveBeenCalledTimes(1);
  });
});
