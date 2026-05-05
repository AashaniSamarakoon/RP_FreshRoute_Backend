const { makeRes } = require("./helpers");

describe("admin/gradingController.verifyGrading", () => {
  test("401 without user", async () => {
    jest.resetModules();
    jest.doMock("../../utils/supabaseClient", () => ({
      supabase: { from: jest.fn() },
    }));
    jest.doMock("../../Services/fruitGrading/fruitGradingService", () => ({
      session: {},
      predictBatch: jest.fn(),
    }));

    const { verifyGrading } = require("../../controllers/admin/gradingController");
    const req = { user: null, body: {}, files: [] };
    const res = makeRes();

    await verifyGrading(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  test("400 without complaint_id or received_grade", async () => {
    jest.resetModules();
    jest.doMock("../../utils/supabaseClient", () => ({
      supabase: { from: jest.fn() },
    }));
    jest.doMock("../../Services/fruitGrading/fruitGradingService", () => ({
      session: {},
      predictBatch: jest.fn(),
    }));

    const { verifyGrading } = require("../../controllers/admin/gradingController");
    const req = { user: { id: "admin-1" }, body: {}, files: [] };
    const res = makeRes();

    await verifyGrading(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  test("400 when not exactly 5 images", async () => {
    jest.resetModules();
    jest.doMock("../../utils/supabaseClient", () => ({
      supabase: { from: jest.fn() },
    }));
    jest.doMock("../../Services/fruitGrading/fruitGradingService", () => ({
      session: {},
      predictBatch: jest.fn(),
    }));

    const { verifyGrading } = require("../../controllers/admin/gradingController");
    const req = {
      user: { id: "admin-1" },
      body: { complaint_id: "c1", received_grade: "Grade A" },
      files: [{ buffer: Buffer.alloc(1) }],
    };
    const res = makeRes();

    await verifyGrading(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  test("200 verified when all 5 predictions match received grade (normalized)", async () => {
    jest.resetModules();

    const supabase = {
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn(() =>
              Promise.resolve({ data: { id: "c1", order_id: "o1" }, error: null })
            ),
          })),
        })),
        update: jest.fn(() => ({
          eq: jest.fn(() => Promise.resolve({ error: null })),
        })),
      })),
    };

    jest.doMock("../../utils/supabaseClient", () => ({ supabase }));
    jest.doMock("../../Services/fruitGrading/fruitGradingService", () => ({
      session: {},
      predictBatch: jest.fn(() =>
        Promise.resolve([
          { className: "A" },
          { className: "A" },
          { className: "A" },
          { className: "A" },
          { className: "A" },
        ])
      ),
    }));

    const { verifyGrading } = require("../../controllers/admin/gradingController");
    const req = {
      user: { id: "admin-1" },
      body: { complaint_id: "c1", received_grade: "Grade A" },
      files: Array.from({ length: 5 }, () => ({ buffer: Buffer.alloc(2) })),
    };
    const res = makeRes();

    await verifyGrading(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.image_verification).toBe("verified");
    expect(res.body.predicted_grades).toEqual([
      "grade a",
      "grade a",
      "grade a",
      "grade a",
      "grade a",
    ]);
    expect(res.body.received_grade_normalized).toBe("grade a");
  });
});
