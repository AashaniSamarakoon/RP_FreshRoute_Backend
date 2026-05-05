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
  test("runMatchingAlgorithm matches OPEN stock with required supply fields and farmer relation", async () => {
    jest.resetModules();

    const order = {
      id: "o-open-pool",
      fruit_type: "Mango",
      variant: "Karuthakolomban",
      grade: "A",
      quantity: 50,
      required_date: "2026-05-12",
      latitude: 6.9271,
      longitude: 79.8612,
    };

    const pool = [
      {
        id: "stock-open-1",
        quantity: 75,
        grade: "A",
        estimated_harvest_date: "2026-05-11",
        status: "OPEN",
        price_per_kg: 240,
        image_url: "https://example.com/mango.jpg",
        image_hash: "hash-1",
        farmer: {
          user_id: "farmer-1",
          reputation: 4.5,
          latitude: 6.936,
          longitude: 79.847,
          location: "Colombo farm",
        },
      },
    ];

    const expiredStockQuery = thenable({ data: [], error: null });
    const expiredProposalQuery = thenable({ data: [], error: null });
    const orderQuery = thenable({ data: order, error: null });
    const stockPoolQuery = thenable({ data: pool, error: null });
    const reserveQuery = thenable({
      data: { id: "stock-open-1" },
      error: null,
    });

    const supabase = {
      from: jest
        .fn()
        .mockReturnValueOnce(expiredStockQuery)
        .mockReturnValueOnce(expiredProposalQuery)
        .mockReturnValueOnce(orderQuery)
        .mockReturnValueOnce(stockPoolQuery)
        .mockReturnValueOnce(reserveQuery),
    };

    const supabaseAdmin = {
      from: jest.fn(() => thenable({ data: { id: "proposal-1" }, error: null })),
    };

    jest.doMock("../../utils/supabaseClient", () => ({
      supabase,
      supabaseAdmin,
    }));

    const { runMatchingAlgorithm } = require("../../Services/matchingService");

    const result = await runMatchingAlgorithm(order.id);

    expect(stockPoolQuery.select).toHaveBeenCalledWith(
      expect.stringContaining("farmer:farmers!farmer_id"),
    );
    expect(stockPoolQuery.eq).toHaveBeenCalledWith("fruit_type", order.fruit_type);
    expect(stockPoolQuery.eq).toHaveBeenCalledWith("variant", order.variant);
    expect(stockPoolQuery.eq).toHaveBeenCalledWith("status", "OPEN");
    expect(stockPoolQuery.gte).toHaveBeenCalledWith("quantity", 1);
    expect(stockPoolQuery.lte).toHaveBeenCalledWith(
      "estimated_harvest_date",
      order.required_date,
    );
    expect(stockPoolQuery.gte).toHaveBeenCalledWith(
      "estimated_harvest_date",
      "2026-05-05",
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      order_id: order.id,
      stock_id: "stock-open-1",
      farmer_id: "farmer-1",
      quantity_allocated: 50,
      stock_grade: "A",
      farmer_location: "Colombo farm",
      farmer_reputation: 4.5,
    });
    expect(result[0].score_breakdown).toEqual(
      expect.objectContaining({
        gradeScore: 1,
        qtyScore: 1,
      }),
    );
  });

  test("runMatchingAlgorithm aggregates eligible stock from multiple farmers for a large order", async () => {
    jest.resetModules();

    const order = {
      id: "o-large",
      fruit_type: "Mango",
      variant: "Alphonso",
      grade: "B",
      quantity: 500,
      required_date: "2026-05-12",
      latitude: 6.9271,
      longitude: 79.8612,
    };

    const pool = [
      {
        id: "stock-200-a",
        quantity: 200,
        grade: "B",
        estimated_harvest_date: "2026-05-11",
        status: "OPEN",
        price_per_kg: 220,
        image_url: null,
        image_hash: null,
        farmer: {
          user_id: "farmer-a",
          reputation: 4.8,
          latitude: 6.928,
          longitude: 79.862,
          location: "Farm A",
        },
      },
      {
        id: "stock-200-b",
        quantity: 200,
        grade: "B",
        estimated_harvest_date: "2026-05-11",
        status: "OPEN",
        price_per_kg: 215,
        image_url: null,
        image_hash: null,
        farmer: {
          user_id: "farmer-b",
          reputation: 4.6,
          latitude: 6.929,
          longitude: 79.863,
          location: "Farm B",
        },
      },
      {
        id: "stock-150-c",
        quantity: 150,
        grade: "B",
        estimated_harvest_date: "2026-05-11",
        status: "OPEN",
        price_per_kg: 210,
        image_url: null,
        image_hash: null,
        farmer: {
          user_id: "farmer-c",
          reputation: 4.4,
          latitude: 6.93,
          longitude: 79.864,
          location: "Farm C",
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
          thenable({ data: { id: "stock-200-a" }, error: null }),
        )
        .mockImplementationOnce(() =>
          thenable({ data: { id: "stock-200-b" }, error: null }),
        )
        .mockImplementationOnce(() =>
          thenable({ data: { id: "stock-150-c" }, error: null }),
        ),
    };

    const supabaseAdmin = {
      from: jest.fn(() => thenable({ data: { id: "proposal" }, error: null })),
    };

    jest.doMock("../../utils/supabaseClient", () => ({
      supabase,
      supabaseAdmin,
    }));

    const { runMatchingAlgorithm } = require("../../Services/matchingService");

    const result = await runMatchingAlgorithm(order.id);

    expect(result).toHaveLength(3);
    expect(result.map((p) => p.farmer_id)).toEqual([
      "farmer-a",
      "farmer-b",
      "farmer-c",
    ]);
    expect(result.map((p) => p.quantity_allocated)).toEqual([200, 200, 100]);
    expect(
      result.reduce((sum, proposal) => sum + proposal.quantity_allocated, 0),
    ).toBe(500);
    expect(supabaseAdmin.from).toHaveBeenCalledWith("estimated_stock");
  });

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
