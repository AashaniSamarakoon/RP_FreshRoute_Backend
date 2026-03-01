# FreshRoute Backend

Welcome to the FreshRoute Backend. This Node.js application is the central nervous system of the platform, responsible for handling all business logic, data processing, and communication between users, the database, and the Hyperledger Fabric blockchain.

## 1. Core Functionality

The backend is a multi-faceted service that performs several critical roles:

#### API Server (Express.js)
The core of the backend is a RESTful API built with Express.js. It provides structured, role-based endpoints for all frontend clients.
- **Role-Based Access:** Routes are grouped by user role (`/api/farmer`, `/api/buyer`, `/api/transporter`).
- **Authentication:** A custom middleware (`Services/auth.js`) checks for a valid JSON Web Token (JWT) on protected routes and verifies the user's role.
- **Logging:** A middleware provides detailed logging for every incoming request, showing the method, path, status code, and response time.

#### Scheduled Services (`node-cron`)
Several automated tasks run on a schedule to keep the platform running smoothly:
- **Batch Matching (`0 */2 * * *`):** Every two hours, the `matchingService` runs to find compatible buy and sell orders. It creates match proposals that are then sent to farmers for approval.
- **Price Scraping & Updates (`0 6 * * *`):** The `dambullaScheduler` uses Puppeteer to scrape daily prices from external market websites. The `freshRoutePriceUpdater` then uses this data to update the platform's internal price benchmarks.
- **SMS Notifications:** The `smsScheduler` uses Twilio to send out timely alerts, such as daily price forecasts to farmers.
- **Data Maintenance (`0 0 * * *`):** A daily job marks old orders as expired.

#### Blockchain Gateway
The backend is the *only* part of the system that communicates directly with the Hyperledger Fabric network.
- **`Services/blockchain/contractService.js`:** This file acts as a singleton gateway to the Fabric network. It handles the gRPC connection, loads the appropriate user identity from the `wallet/` directory, and invokes chaincode functions.
- **Wallet Management:** For each user who needs to interact with the blockchain, a `.id` file is created in the `wallet/` directory. This file contains the user's certificate and private key, allowing the backend to sign transactions on their behalf.

#### Data Management (Supabase/PostgreSQL)
While the blockchain stores the final, immutable record of transfers and agreements, the backend uses a PostgreSQL database (via Supabase) for more dynamic, off-chain data. This includes:
- User profiles and credentials.
- Pending orders that have not yet been matched.
- Cached market data and price forecasts.

#### IoT & Telemetry
The backend is equipped to handle data from IoT devices in the supply chain.
- The `serialport` dependency allows for direct communication with hardware sensors.
- The `/api/telemetry` and `/api/logistics` routes are designed to receive data like temperature, humidity, and GPS coordinates from transport vehicles, enabling real-time shipment monitoring.

## 2. Setup and Installation (From Scratch)

Follow these steps to get the backend server running locally.

### Prerequisites
*   **Node.js:** v18 or higher is recommended.
*   **Git:** For cloning the repository.
*   **Running Blockchain Network:** The Hyperledger Fabric network must be running. See the `../Blockchain/README.md` for instructions.
*   **Supabase Account or PostgreSQL DB:** You need a PostgreSQL connection string.

### Step-by-Step Installation

1.  **Navigate to this Directory:**
    Make sure you are in the `Backend` directory.

2.  **Install Dependencies:**
    ```bash
    npm install
    ```
    This will install all packages listed in `package.json`.

3.  **Set Up Environment Variables:**
    Create a file named `.env` in this directory. This file is crucial for storing secrets and configuration. Copy the following template and fill in the values.

    ```env
    # --- Supabase / PostgreSQL Database ---
    # Find these in your Supabase project settings
    SUPABASE_URL=https://<your-project-ref>.supabase.co
    SUPABASE_KEY=<your-supabase-anon-key>

    # --- JSON Web Token (JWT) ---
    # Use a long, random, and secret string for security
    JWT_SECRET=your_super_secret_jwt_string

    # --- Twilio for SMS Notifications ---
    # Find these in your Twilio account dashboard
    TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
    TWILIO_AUTH_TOKEN=your_twilio_auth_token
    TWILIO_PHONE_NUMBER=+15551234567

    # --- Server Configuration ---
    # The port the backend server will run on
    PORT=4000
    ```

4.  **Run the Development Server:**
    ```bash
    npm run dev
    ```
    This command uses `nodemon` to start the server. It will automatically restart the server whenever you save a file, making development much faster. The server will be available at `http://localhost:4000`.

## 3. Project Structure

The backend code is organized into the following directories:

-   `controllers/`: Handles incoming HTTP requests, validates data, and sends responses. It acts as the bridge between routes and services.
-   `routes/`: Defines all the API endpoints using Express Router. It maps URLs to specific controller functions.
-   `Services/`: Contains the core business logic. This is where complex operations like order matching, blockchain communication, and notification scheduling live.
-   `utils/`: Holds reusable utility functions and clients, such as the `supabaseClient.js` for database connections.
-   `wallet/`: Stores the cryptographic identities (`.id` files) for users who interact with the blockchain. **This directory should be in your `.gitignore` and never committed to version control.**
-   `index.js`: The main entry point for the application. It initializes the Express server, sets up middleware, defines routes, and starts the cron jobs.

## 4. Dependencies

| Package                       | Description                                |
| ----------------------------- | ------------------------------------------ |
| `@grpc/grpc-js`               | gRPC library for Node.js                   |
| `@hyperledger/fabric-gateway` | High-level API for Hyperledger Fabric      |
| `@supabase/supabase-js`       | Supabase client library                    |
| `bcryptjs`                    | Password hashing                           |
| `cors`                        | CORS middleware                            |
| `dotenv`                      | Loads environment variables from `.env`    |
| `express`                     | Web framework                              |
| `fabric-ca-client`            | Client for Fabric Certificate Authority    |
| `fabric-network`              | Legacy client for Hyperledger Fabric       |
| `jsonwebtoken`                | JSON Web Token implementation              |
| `multer`                      | Middleware for file uploads                |
| `node-cron`                   | Job scheduler                              |
| `node-fetch`                  | `window.fetch` for Node.js                 |
| `pg`                          | PostgreSQL client                          |
| `puppeteer`                   | Headless Chrome for web scraping           |
| `serialport`                  | Access serial ports for IoT                |
| `twilio`                      | Twilio API client for SMS                  |
| `nodemon` (dev)               | Monitors for changes and restarts server   |