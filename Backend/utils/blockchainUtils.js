// shared helper for submitting Fabric transactions and capturing transaction IDs

async function submitWithTx(contract, fn, ...args) {
  const tx = contract.createTransaction(fn);
  const txId = tx.getTransactionId();
  await tx.submit(...args);
  return txId;
}

module.exports = { submitWithTx };
