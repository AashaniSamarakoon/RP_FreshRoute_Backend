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
    // try to parse the returned buffer/bytes in case contract itself included txId
    if (result) {
      try {
        // result may be Buffer, Uint8Array, or string
        let text;
        if (typeof result === "string") {
          text = result;
        } else if (result instanceof Uint8Array) {
          // convert the bytes to string
          text = Buffer.from(result).toString();
        } else if (result.toString) {
          text = result.toString();
        }
        if (text) {
          const json = JSON.parse(text);
          if (json && json.txId) {
            console.log("[blockchainUtils] extracted txId from result", json.txId);
            return json.txId;
          }
        }
      } catch (e) {
        // ignore parse errors
      }
    }
    return null;
  }

  throw new Error("Invalid contract object passed to submitWithTx");
}

module.exports = { submitWithTx };
