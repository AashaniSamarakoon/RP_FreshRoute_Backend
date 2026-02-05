const grpc = require("@grpc/grpc-js");
const { connect, hash, signers } = require("@hyperledger/fabric-gateway");
const crypto = require("crypto");
const fs = require("fs").promises;
const path = require("path");

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

// Note the new parameter: contractName
async function getContract(userId, contractName) {
  // 1. Load User Identity
  const walletPath = path.join(process.cwd(), "wallet", `${userId}.id`);

  // Check if wallet exists
  try {
    await fs.access(walletPath);
  } catch {
    throw new Error(
      `Wallet for user ${userId} not found. Please register first.`,
    );
  }

  const identityData = JSON.parse(await fs.readFile(walletPath, "utf8"));

  // 2. TLS Setup - FreshRoute Production Network
  const tlsCertPath = path.resolve(
    __dirname,
    "../../../Blockchain/freshroute-network/organizations/peerOrganizations/farmer.freshroute.com/peers/peer0.farmer.freshroute.com/tls/ca.crt",
  );
  const tlsRootCert = await fs.readFile(tlsCertPath);
  const tlsCredentials = grpc.credentials.createSsl(tlsRootCert);

  const client = new grpc.Client("localhost:7051", tlsCredentials, {
    "grpc.ssl_target_name_override": "peer0.farmer.freshroute.com",
  });

  // 3. Gateway Connection
  const gateway = connect({
    client,
    identity: {
      mspId: identityData.mspId,
      credentials: Buffer.from(identityData.credentials.certificate),
    },
    signer: signers.newPrivateKeySigner(
      crypto.createPrivateKey(identityData.credentials.privateKey),
    ),
    hash: hash.sha256,
  });

  const network = gateway.getNetwork("freshroute-channel");

  // 4. GET SPECIFIC CONTRACT
  // We connect to chaincode 'freshroute' on FreshRoute Network
  const contract = network.getContract("freshroute", contractName);

  return {
    contract,
    close: () => {
      gateway.close();
      client.close();
    },
  };
}

module.exports = { getContract };
