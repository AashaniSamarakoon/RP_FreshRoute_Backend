# FreshRoute Blockchain 

This document provides a comprehensive, step-by-step guide for setting up and running the Hyperledger Fabric network that powers the FreshRoute platform. Fabric provides the decentralized, immutable ledger for tracking all assets and agreements in the supply chain.

## 1. Prerequisites: Setting Up Your Environment

Before you can run the network, you must install several dependencies. This is the most critical step.

### 1.1. Core Tools
Ensure the following tools are installed on your system.

*   **Git:** For version control.
*   **cURL:** For downloading files.
*   **Docker and Docker Compose:** The Fabric network runs in Docker containers. Ensure they are installed and the Docker daemon is running.
*   **Go:** Required for some Fabric components.
*   **Node.js:** Required for running Fabric SDKs and chaincode.
*   **Python:** (Legacy requirement for some older scripts).

### 1.2. Installing Hyperledger Fabric Samples and Binaries (Crucial Step)

The scripts required to run the network (like `network.sh`) and the necessary binary files (`cryptogen`, `configtxgen`, etc.) are **not included directly in this repository**. You must download them from the official Hyperledger Fabric repositories.

This step will create a `fabric-samples` directory, which contains the `test-network` and the `bin` directory that this project relies on.

1.  **Open a terminal and choose a directory** where you want to download the Fabric Samples. This should be **outside** of the FreshRoute project directory.

2.  **Download and Install Fabric:**
    Run the following command to download and install Fabric Samples, binaries, and Docker images for version 2.2. This version is compatible with the Node.js SDKs used in this project's backend.

    ```bash
    curl -sSL https://raw.githubusercontent.com/hyperledger/fabric/v2.2.0/scripts/bootstrap.sh | bash -s -- 2.2.0 1.4.9 -d -s
    ```

    This command will:
    *   Download `fabric-samples` and checkout the `v2.2.0` tag.
    *   Download the platform-specific Fabric binaries (like `configtxgen`, `cryptogen`, `peer`, `orderer`) and place them in a `bin` subdirectory within `fabric-samples`.
    *   Download the necessary Fabric Docker images.

3.  **Add Fabric Binaries to Your Path:**
    For convenience, add the newly created `bin` directory to your system's PATH. This allows you to run commands like `peer` and `configtxgen` from any location.

    ```bash
    # Example for Linux/macOS - add this to your .bashrc or .zshrc
    export PATH=<path_to_your_fabric-samples_directory>/bin:$PATH
    ```
    Replace `<path_to_your_fabric-samples_directory>` with the actual path where the files were downloaded.

After this step, the `Blockchain` directory in *this* project can be seen as an extension or a customized version of the `fabric-samples` you just downloaded.

## 2. Running the FreshRoute Network

With the prerequisites installed, you can now start the network and deploy the chaincode.

### 2.1. Start the Fabric Test Network

The `test-network` script provides a simple way to stand up a development Fabric network.

1.  **Navigate to the `test-network` directory** within this repository:
    ```bash
    cd Blockchain/test-network
    ```

2.  **Start the network and create a channel:**
    ```bash
    ./network.sh up createChannel -ca
    ```
    *   `up`: Brings up the Docker containers for the network (2 peers, 1 orderer).
    *   `createChannel`: Creates a channel named `mychannel` for the peers to communicate on.
    *   `-ca`: Starts the network with Certificate Authorities (CAs), which are required for registering new users (like the ones the backend will create).

    If this command fails, the most common reason is that the prerequisites (especially Fabric binaries) were not installed correctly.

### 2.2. Deploy the `freshroute` Chaincode

Once the network is running, deploy the custom smart contract.

1.  **Run the deployment script** from the same `test-network` directory:
    ```bash
    ./network.sh deployCC -ccn freshroute -ccp ../asset-transfer-basic/chaincode-typescript/ -ccl typescript
    ```
    This command orchestrates the entire chaincode deployment lifecycle.
    *   `-ccn freshroute`: This is the **name** of our chaincode. The backend is hardcoded to look for this name.
    *   `-ccp ../asset-transfer-basic/chaincode-typescript/`: This is the **path** to the chaincode source code.
    *   `-ccl typescript`: This specifies the **language** of the chaincode.

    After a successful deployment, you will see a confirmation message in the logs.

## 3. How the Backend Connects

The backend application (`../Backend`) is configured to act as a client to this Fabric network.

*   **Connection Profile:** The `Backend/Services/blockchain/contractService.js` file contains the logic to connect to the network. It uses the TLS certificates from the `Blockchain/test-network/organizations` directory to establish a secure gRPC connection to the peer at `localhost:7051`.
*   **User Wallets:** When a new user registers in the FreshRoute application, the backend generates a cryptographic identity and stores it in the `Backend/wallet` directory. This identity is then used to sign all subsequent transactions that the user submits to the blockchain, ensuring accountability.

## 4. Shutting Down the Network

When you are finished with development, you can shut down the network to free up system resources.

1.  **Navigate to the `test-network` directory:**
    ```bash
    cd Blockchain/test-network
    ```
2.  **Run the `down` command:**
    ```bash
    ./network.sh down
    ```
    This will stop and remove all Docker containers, networks, and volumes associated with the Fabric network, giving you a clean state for the next time you run `./network.sh up`.
