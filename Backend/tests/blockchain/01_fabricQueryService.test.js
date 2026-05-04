function makeContract(result) {
  return {
    evaluateTransaction: jest.fn().mockResolvedValue(Buffer.from(JSON.stringify(result))),
  };
}

describe("Services/blockchain/fabricQueryService", () => {
  test("queryBatchById returns parsed batch", async () => {
    jest.resetModules();

    const getContract = jest.fn().mockResolvedValue({
      contract: makeContract({ batchId: "B1", status: "CREATED" }),
      close: jest.fn(),
    });

    jest.doMock("../../Services/blockchain/contractService", () => ({ getContract }));

    const { queryBatchById } = require("../../Services/blockchain/fabricQueryService");

    const batch = await queryBatchById("u1", "B1");

    expect(batch.batchId).toBe("B1");
    expect(batch.status).toBe("CREATED");
  });

  test("queryAllBatches filters by status and productType", async () => {
    jest.resetModules();

    const getContract = jest.fn().mockResolvedValue({
      contract: makeContract([
        { batchId: "B1", status: "CREATED", productType: "Mango" },
        { batchId: "B2", status: "DELIVERED", productType: "Banana" },
      ]),
      close: jest.fn(),
    });

    jest.doMock("../../Services/blockchain/contractService", () => ({ getContract }));

    const { queryAllBatches } = require("../../Services/blockchain/fabricQueryService");

    const batches = await queryAllBatches("u1", { status: "CREATED", productType: "Mango" });

    expect(batches).toHaveLength(1);
    expect(batches[0].batchId).toBe("B1");
  });

  test("getBatchStatistics aggregates counts", async () => {
    jest.resetModules();

    const getContract = jest.fn().mockResolvedValue({
      contract: makeContract([
        { batchId: "B1", status: "CREATED", productType: "Mango", quantity: 10 },
        { batchId: "B2", status: "CREATED", productType: "Mango", quantity: 5 },
        { batchId: "B3", status: "DELIVERED", productType: "Banana", quantity: 7 },
      ]),
      close: jest.fn(),
    });

    jest.doMock("../../Services/blockchain/contractService", () => ({ getContract }));

    const { getBatchStatistics } = require("../../Services/blockchain/fabricQueryService");

    const stats = await getBatchStatistics("u1");

    expect(stats.totalBatches).toBe(3);
    expect(stats.byStatus.CREATED).toBe(2);
    expect(stats.byProduct.Mango).toBe(2);
    expect(stats.totalQuantity).toBe(22);
  });
});
