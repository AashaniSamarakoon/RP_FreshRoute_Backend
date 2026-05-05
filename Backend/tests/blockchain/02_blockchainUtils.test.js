const { submitWithTx } = require("../../utils/blockchainUtils");

describe("blockchainUtils.submitWithTx", () => {
  test("uses fabric-gateway submitAsync and returns transaction id", async () => {
    const submitted = {
      getStatus: jest.fn().mockResolvedValue({ successful: true, code: 0 }),
      getTransactionId: jest.fn().mockReturnValue("tx-gateway-1"),
    };
    const contract = {
      submitAsync: jest.fn().mockResolvedValue(submitted),
    };

    await expect(submitWithTx(contract, "CreateThing", "a", "b")).resolves.toBe(
      "tx-gateway-1",
    );

    expect(contract.submitAsync).toHaveBeenCalledWith("CreateThing", {
      arguments: ["a", "b"],
    });
  });

  test("throws when fabric-gateway commit status is unsuccessful", async () => {
    const submitted = {
      getStatus: jest.fn().mockResolvedValue({ successful: false, code: 11 }),
      getTransactionId: jest.fn().mockReturnValue("tx-bad"),
    };
    const contract = {
      submitAsync: jest.fn().mockResolvedValue(submitted),
    };

    await expect(submitWithTx(contract, "CreateThing")).rejects.toThrow(
      "Transaction tx-bad failed to commit with status 11",
    );
  });

  test("keeps fabric-network createTransaction compatibility", async () => {
    const tx = {
      getTransactionId: jest.fn().mockReturnValue("tx-network-1"),
      submit: jest.fn().mockResolvedValue(undefined),
    };
    const contract = {
      createTransaction: jest.fn().mockReturnValue(tx),
    };

    await expect(submitWithTx(contract, "UpdateThing", "x")).resolves.toBe(
      "tx-network-1",
    );

    expect(contract.createTransaction).toHaveBeenCalledWith("UpdateThing");
    expect(tx.submit).toHaveBeenCalledWith("x");
  });
});
