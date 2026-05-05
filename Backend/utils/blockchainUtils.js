// Shared helper for submitting Fabric transactions and capturing transaction IDs.

function bytesToJson(bytes) {
  if (!bytes) return null;

  try {
    const text =
      typeof bytes === "string" ? bytes : Buffer.from(bytes).toString("utf8");
    return text ? JSON.parse(text) : null;
  } catch (_err) {
    return null;
  }
}

async function submitWithTx(contract, fn, ...args) {
  if (!contract) {
    throw new Error("Invalid contract object passed to submitWithTx");
  }

  // @hyperledger/fabric-gateway API. This is the SDK used by contractService.
  if (typeof contract.submitAsync === "function") {
    const submitted = await contract.submitAsync(fn, { arguments: args });
    const status = await submitted.getStatus();

    if (!status.successful) {
      throw new Error(
        `Transaction ${submitted.getTransactionId()} failed to commit with status ${status.code}`,
      );
    }

    return submitted.getTransactionId();
  }

  // Finer-grained gateway flow, useful if submitAsync is unavailable.
  if (typeof contract.newProposal === "function") {
    const proposal = contract.newProposal(fn, { arguments: args });
    const transaction = await proposal.endorse();
    const commit = await transaction.submit();
    const status = await commit.getStatus();

    if (!status.successful) {
      throw new Error(
        `Transaction ${transaction.getTransactionId()} failed to commit with status ${status.code}`,
      );
    }

    return transaction.getTransactionId();
  }

  // fabric-network v2 API.
  if (typeof contract.createTransaction === "function") {
    const tx = contract.createTransaction(fn);
    const txId = tx.getTransactionId();
    await tx.submit(...args);
    return txId;
  }

  // Last-resort fallback. Some mocks/older wrappers only expose submitTransaction.
  if (typeof contract.submitTransaction === "function") {
    const result = await contract.submitTransaction(fn, ...args);
    const json = bytesToJson(result);
    return json?.txId || null;
  }

  throw new Error("Invalid contract object passed to submitWithTx");
}

module.exports = { submitWithTx };
