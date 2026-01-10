# FreshRoute Blockchain

This directory contains the Hyperledger Fabric components of the FreshRoute platform. Fabric is used to provide a decentralized, immutable ledger for tracking key assets and events in the supply chain, ensuring transparency and trust among all participants.

## Overview

The blockchain network serves as the single source of truth for:
*   **Asset Tracking:** Recording the lifecycle of produce from creation (harvest) to final sale.
*   **Order Agreements:** Storing finalized matches between buyers and sellers as immutable transactions.
*   **Shipment Provenance:** Tracking ownership and custody changes as produce moves through the supply chain.

The backend application interacts with this network via the `fabric-gateway` library. User-specific wallets, stored in the `Backend/wallet` directory, contain the cryptographic identities required to sign transactions on behalf of users.

## Chaincode: `freshroute`

The core business logic on the blockchain is encapsulated in a smart contract (chaincode) named **`freshroute`**. While this repository contains several Fabric samples, the custom logic for this platform is designed to be deployed under this name.

The chaincode is developed in TypeScript (located in `asset-transfer-basic/chaincode-typescript`) and exposes multiple contracts:

*   **`AssetTransferContract`:** Manages the lifecycle of the primary asset (e.g., a batch of produce). It includes functions to create assets, transfer ownership, and query asset history.
*   **`OrderContract` (Conceptual):** Designed to handle the creation and settlement of orders on the ledger.
*   **`ShipmentContract` (Conceptual):** Manages the logistics and telemetry data associated with a shipment.

The backend's `contractService.js` is responsible for connecting to the `freshroute` chaincode and invoking the appropriate contract based on the required business function.

## Development Network Setup

The project is configured to work with the standard Hyperledger Fabric `test-network`.

### Prerequisites
*   Docker & Docker Compose
*   `build-essential` and `libtool` packages (or equivalent for your OS)
*   Hyperledger Fabric Samples and Binaries (refer to the official Fabric documentation for installation)

### Steps to Run the Network

1.  **Start the Test Network:**
    Navigate to the `test-network` directory and start the Fabric network with Certificate Authorities (CAs).

    ```bash
    cd Blockchain/test-network
    ./network.sh up createChannel -ca
    ```
    This command creates a channel named `mychannel`.

2.  **Deploy the Chaincode:**
    Use the `network.sh` script to deploy the `freshroute` chaincode. The following command deploys the TypeScript chaincode from the `asset-transfer-basic` sample. Adjust the path if you have a different chaincode directory.

    ```bash
    # From the 'test-network' directory
    ./network.sh deployCC -ccn freshroute -ccp ../asset-transfer-basic/chaincode-typescript/ -ccl typescript
    ```
    *   `-ccn freshroute`: Sets the chaincode name to `freshroute`.
    *   `-ccp`: Specifies the path to the chaincode source.
    *   `-ccl typescript`: Defines the chaincode language.

3.  **Interact with the Network:**
    Once the network is running and the chaincode is deployed, the backend application can connect to it. Ensure the connection profiles and certificate paths in `Backend/Services/blockchain/contractService.js` match the `test-network`'s configuration. The default configuration points to `localhost:7051` for the Org1 peer.