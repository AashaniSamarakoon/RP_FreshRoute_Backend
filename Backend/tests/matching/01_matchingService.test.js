function thenable(result) {
  const p = Promise.resolve(result);
  const chain = {
    select: jest.fn(() => chain),
    update: jest.fn(() => chain),
    insert: jest.fn(() => chain),
    eq: jest.fn(() => chain),
    in: jest.fn(() => chain),
    lt: jest.fn(() => chain),
    lte: jest.fn(() => chain),
    gte: jest.fn(() => chain),
    order: jest.fn(() => chain),
    single: jest.fn(() => p),
  };
  chain.then = p.then.bind(p);
  chain.catch = p.catch.bind(p);
  chain.finally = p.finally.bind(p);
  return chain;
}

describe("Services/matchingService", () => {
  test("runMatchingAlgorithm skips sub-grade stock", async () => {
    jest.resetModules();

    const order = {
      id: "o1",
      fruit_type: "Mango",
      variant: "Alphonso",
      grade: "B",
      quantity: 10,
      required_date: "2026-05-10",
      latitude: 6.9,
      longitude: 79.9,
    };

    const pool = [
      {
        id: "s1",
        quantity: 5,
        grade: "C",
        estimated_harvest_date: "2026-05-09",
        status: "OPEN",
        price_per_kg: 100,
        image_url: null,
        image_hash: null,
        farmer: {
          user_id: "f1",
          reputation: 4,
          latitude: 7.0,
          longitude: 80.0,
        },
      },
      {
        id: "s2",
        quantity: 10,
        grade: "B",
        estimated_harvest_date: "2026-05-09",
        status: "OPEN",
        price_per_kg: 100,
        image_url: null,
        image_hash: null,
        farmer: {
          user_id: "f2",
          reputation: 3,
          latitude: 6.95,
          longitude: 79.95,
        },
      },
    ];

    const supabase = {
      from: jest
        .fn()
        .mockImplementationOnce(() => thenable({ data: [], error: null }))
        .mockImplementationOnce(() => thenable({ data: [], error: null }))
        .mockImplementationOnce(() => thenable({ data: order, error: null }))
        .mockImplementationOnce(() => thenable({ data: pool, error: null }))
        .mockImplementationOnce(() =>
          thenable({ data: { id: "s2" }, error: null }),
        ),
    };

    const supabaseAdmin = {
      from: jest.fn(() => thenable({ data: { id: "p1" }, error: null })),
    };

    jest.doMock("../../utils/supabaseClient", () => ({
      supabase,
      supabaseAdmin,
    }));

    const { runMatchingAlgorithm } = require("../../Services/matchingService");

    const result = await runMatchingAlgorithm("o1");

    expect(result).toHaveLength(1);
    expect(result[0].stock_grade).toBe("B");
  });

  test("runMatchingAlgorithm skips stale harvest stock", async () => {
    jest.resetModules();

    const order = {
      id: "o1",
      fruit_type: "Mango",
      variant: "Alphonso",
      grade: "B",
      quantity: 10,
      required_date: "2026-05-10",
      latitude: 6.9,
      longitude: 79.9,
    };

    const pool = [
      {
        id: "s1",
        quantity: 10,
        grade: "B",
        estimated_harvest_date: "2026-03-13",
        status: "OPEN",
        price_per_kg: 100,
        image_url: null,
        image_hash: null,
        farmer: {
          user_id: "f1",
          reputation: 4,
          latitude: 7.0,
          longitude: 80.0,
        },
      },
      {
        id: "s2",
        quantity: 10,
        grade: "B",
        estimated_harvest_date: "2026-05-08",
        status: "OPEN",
        price_per_kg: 100,
        image_url: null,
        image_hash: null,
        farmer: {
          user_id: "f2",
          reputation: 3,
          latitude: 6.95,
          longitude: 79.95,
        },
      },
    ];

    const supabase = {
      from: jest
        .fn()
        .mockImplementationOnce(() => thenable({ data: [], error: null }))
        .mockImplementationOnce(() => thenable({ data: [], error: null }))
        .mockImplementationOnce(() => thenable({ data: order, error: null }))
        .mockImplementationOnce(() => thenable({ data: pool, error: null }))
        .mockImplementationOnce(() =>
          thenable({ data: { id: "s2" }, error: null }),
        ),
    };

    const supabaseAdmin = {
      from: jest.fn(() => thenable({ data: { id: "p1" }, error: null })),
    };

    jest.doMock("../../utils/supabaseClient", () => ({
      supabase,
      supabaseAdmin,
    }));

    const { runMatchingAlgorithm } = require("../../Services/matchingService");

    const result = await runMatchingAlgorithm("o1");

    expect(result).toHaveLength(1);
    expect(result[0].stock_id).toBe("s2");
  });

  test("releaseMatchedStockForExpiredPayments returns count", async () => {
    jest.resetModules();

    const supabaseAdmin = {
      from: jest
        .fn()
        .mockImplementationOnce(() =>
          thenable({ data: [{ id: "o1", harvest_id: "h1" }], error: null }),
        )
        .mockImplementationOnce(() => thenable({ data: null, error: null }))
        .mockImplementationOnce(() => thenable({ data: null, error: null }))
        .mockImplementationOnce(() => thenable({ data: null, error: null })),
    };

    const supabase = { from: jest.fn() };

    jest.doMock("../../utils/supabaseClient", () => ({
      supabase,
      supabaseAdmin,
    }));

    const {
      releaseMatchedStockForExpiredPayments,
    } = require("../../Services/matchingService");

    const count = await releaseMatchedStockForExpiredPayments();

    expect(count).toBe(1);
  });
});
