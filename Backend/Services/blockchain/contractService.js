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
  // Peer TLS certificate
  const peerTlsCertPath = path.resolve(
    __dirname,
    "../../../Blockchain/freshroute-network/organizations/peerOrganizations/farmer.freshroute.com/peers/peer0.farmer.freshroute.com/tls/ca.crt",
  );
  const peerTlsRootCert = await fs.readFile(peerTlsCertPath);
  const peerTlsCredentials = grpc.credentials.createSsl(peerTlsRootCert);

  // Orderer TLS certificate
  const ordererTlsCertPath = path.resolve(
    __dirname,
    "../../../Blockchain/freshroute-network/organizations/ordererOrganizations/freshroute.com/orderers/orderer.freshroute.com/tls/ca.crt",
  );
  const ordererTlsRootCert = await fs.readFile(ordererTlsCertPath);
  const ordererTlsCredentials = grpc.credentials.createSsl(ordererTlsRootCert);

  // Peer client
  const peerClient = new grpc.Client("localhost:7051", peerTlsCredentials, {
    "grpc.ssl_target_name_override": "peer0.farmer.freshroute.com",
  });

  // Orderer client (not directly used but helps with discovery)
  const ordererClient = new grpc.Client("localhost:7050", ordererTlsCredentials, {
    "grpc.ssl_target_name_override": "orderer.freshroute.com",
  });

  // 3. Gateway Connection with timeouts
  const gateway = connect({
    client: peerClient,
    identity: {
      mspId: identityData.mspId,
      credentials: Buffer.from(identityData.credentials.certificate),
    },
    signer: signers.newPrivateKeySigner(
      crypto.createPrivateKey(identityData.credentials.privateKey),
    ),
    hash: hash.sha256,
    // Add explicit timeouts for better error handling
    evaluateOptions: () => ({ deadline: Date.now() + 5000 }),
    endorseOptions: () => ({ deadline: Date.now() + 15000 }),
    submitOptions: () => ({ deadline: Date.now() + 5000 }),
    commitStatusOptions: () => ({ deadline: Date.now() + 60000 }),
  });

  const network = gateway.getNetwork("freshroute-channel");

  // 4. GET SPECIFIC CONTRACT
  // We connect to chaincode 'freshroute' on FreshRoute Network
  const contract = network.getContract("freshroute", contractName);

  return {
    contract,
    network,
    close: () => {
      gateway.close();
      peerClient.close();
      ordererClient.close();
    },
  };
}

module.exports = { getContract };