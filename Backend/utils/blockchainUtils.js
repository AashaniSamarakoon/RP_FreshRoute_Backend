// shared helper for submitting Fabric transactions and capturing transaction IDs

async function submitWithTx(contract, fn, ...args) {
  if (contract && typeof contract.createTransaction === "function") {
    const tx = contract.createTransaction(fn);
    const txId = tx.getTransactionId();
    await tx.submit(...args);
    return txId;
  }

  // fallback for contracts that don't expose createTransaction (older API or mis-configured object)
  if (contract && typeof contract.submitTransaction === "function") {
    console.warn(
      "[blockchainUtils] contract.createTransaction not available, falling back to submitTransaction (no txId will be returned)"
    );
    console.dir(contract, { depth: 1 });
    console.warn("typeof submitTransaction ->", typeof contract.submitTransaction);
    const result = await contract.submitTransaction(fn, ...args);
    console.log("[blockchainUtils] fallback submitTransaction returned:", result);
    // sometimes the return buffer may include txId metadata
    if (result && result.txId) {
      console.log("[blockchainUtils] extracted txId from result", result.txId);
      return result.txId;
    }
    return null;
  }

  throw new Error("Invalid contract object passed to submitWithTx");
}

module.exports = { submitWithTx };
