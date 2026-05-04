function makeRes() {
  const res = {};
  res.statusCode = 200;
  res.status = jest.fn((code) => {
    res.statusCode = code;
    return res;
  });
  res.json = jest.fn((payload) => {
    res.body = payload;
    return res;
  });
  return res;
}

function thenable(result) {
  const p = Promise.resolve(result);
  const chain = {
    select: jest.fn(() => chain),
    update: jest.fn(() => chain),
    eq: jest.fn(() => chain),
    in: jest.fn(() => chain),
    order: jest.fn(() => chain),
    single: jest.fn(() => p),
  };
  chain.then = p.then.bind(p);
  chain.catch = p.catch.bind(p);
  chain.finally = p.finally.bind(p);
  return chain;
}

describe("buyer/matchingController", () => {
  test("triggerMatching rejects non-OPEN orders", async () => {
    jest.resetModules();

    const supabaseAdmin = {
      from: jest
        .fn()
        .mockImplementationOnce(() =>
          thenable({ data: { user_id: "u1" }, error: null }),
        )
        .mockImplementationOnce(() =>
          thenable({ data: { id: "o1", status: "PENDING_BUYER" }, error: null }),
        ),
    };

    jest.doMock("../../utils/supabaseClient", () => ({ supabaseAdmin }));
    jest.doMock("../../Services/matchingService", () => ({
      runMatchingAlgorithm: jest.fn(),
      releaseStockReservation: jest.fn(),
    }));

    const { triggerMatching } = require("../../controllers/buyer/matchingController");

    const req = { user: { id: "u1" }, params: { orderId: "o1" } };
    const res = makeRes();

    await triggerMatching(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch("Cannot match order");
  });

  test("triggerMatching returns proposals and updates order", async () => {
    jest.resetModules();

    const supabaseAdmin = {
      from: jest
        .fn()
        .mockImplementationOnce(() =>
          thenable({ data: { user_id: "u1" }, error: null }),
        )
        .mockImplementationOnce(() =>
          thenable({ data: { id: "o1", status: "OPEN" }, error: null }),
        )
        .mockImplementationOnce(() => thenable({ data: null, error: null })),
    };

    jest.doMock("../../utils/supabaseClient", () => ({ supabaseAdmin }));
    jest.doMock("../../Services/matchingService", () => ({
      runMatchingAlgorithm: jest.fn().mockResolvedValue([
        { proposal_id: "p1" },
        { proposal_id: "p2" },
      ]),
      releaseStockReservation: jest.fn(),
    }));

    const { triggerMatching } = require("../../controllers/buyer/matchingController");

    const req = { user: { id: "u1" }, params: { orderId: "o1" } };
    const res = makeRes();

    await triggerMatching(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.totalProposals).toBe(2);
  });

  test("approveProposal updates proposal and order", async () => {
    jest.resetModules();

    const supabaseAdmin = {
      from: jest
        .fn()
        .mockImplementationOnce(() =>
          thenable({ data: { user_id: "u1" }, error: null }),
        )
        .mockImplementationOnce(() =>
          thenable({
            data: { id: "p1", order_id: "o1", order: { buyer_id: "u1" } },
            error: null,
          }),
        )
        .mockImplementationOnce(() => thenable({ data: null, error: null }))
        .mockImplementationOnce(() => thenable({ data: null, error: null })),
    };

    jest.doMock("../../utils/supabaseClient", () => ({ supabaseAdmin }));

    const { approveProposal } = require("../../controllers/buyer/matchingController");

    const req = { user: { id: "u1" }, params: { proposalId: "p1" } };
    const res = makeRes();

    await approveProposal(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.proposalId).toBe("p1");
  });
});
