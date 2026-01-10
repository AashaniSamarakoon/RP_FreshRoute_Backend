# FreshRoute Backend

This directory contains the Node.js backend for the FreshRoute platform. It serves as the central API, handling business logic, user authentication, database interactions, and communication with the Hyperledger Fabric blockchain.

## Features

*   **RESTful API:** A comprehensive API for all platform functionalities, with role-based access control for Farmers, Buyers, and Transporters.
*   **Authentication:** Uses JWT for secure, stateless authentication.
*   **Scheduled Tasks:** `node-cron` is used for running critical background jobs:
    *   **Order Matching:** Periodically matches available produce with buy orders.
    *   **Price Updates:** Daily scrapes market data to update the internal pricing engine.
    *   **Notifications:** Sends out scheduled SMS alerts to users.
*   **Blockchain Gateway:** The `Services/blockchain/contractService.js` acts as a gateway to the Hyperledger Fabric network, managing user identities and abstracting chaincode interactions.
*   **Database:** Uses Supabase (PostgreSQL) for storing application data like user profiles, orders, and non-blockchain-related information.

## Getting Started

### Prerequisites

*   Node.js (v18+ recommended)
*   A running PostgreSQL instance (or a Supabase project).
*   A configured `.env` file with credentials.

### Installation & Setup

1.  **Install Dependencies:**
    From the `Backend` directory, run:
    ```bash
    npm install
    ```

2.  **Environment Variables:**
    Create a `.env` file in the `Backend` directory and populate it with the necessary credentials. See `.env.example` if available, or use the following template:

    ```env
    # Supabase/PostgreSQL
    SUPABASE_URL=YOUR_SUPABASE_URL
    SUPABASE_KEY=YOUR_SUPABASE_ANON_KEY

    # JWT
    JWT_SECRET=a_strong_secret_for_signing_tokens

    # Twilio for SMS
    TWILIO_ACCOUNT_SID=YOUR_TWILIO_SID
    TWILIO_AUTH_TOKEN=YOUR_TWILIO_TOKEN
    TWILIO_PHONE_NUMBER=YOUR_TWILIO_PHONE_NUMBER

    # Server Port
    PORT=4000
    ```

3.  **Run the Server:**
    *   For development with live-reloading:
        ```bash
        npm run dev
        ```
    *   For production:
        ```bash
        npm start
        ```

## API Endpoints

The API is structured by user roles. All role-specific routes require a valid JWT.

*   `/api/auth`: User registration and login.
*   `/api/farmer`: Endpoints for farmers (e.g., managing stock, viewing proposals).
*   `/api/buyer`: Endpoints for buyers (e.g., placing orders, viewing matches).
*   `/api/transporter`: Endpoints for transporters (e.g., managing logistics, viewing telemetry data).
*   `/api/common`: Endpoints for common data (e.g., fruit lists).

For a complete list of routes, please inspect the `index.js` and the files within the `routes/` directory.

## Dependencies

This backend relies on the following packages:

| Package | Version | Description |
|---|---|---|
| @grpc/grpc-js | ^1.14.3 | gRPC library for Node.js |
| @hyperledger/fabric-gateway | ^1.10.0 | High-level API for Hyperledger Fabric |
| @supabase/supabase-js | ^2.86.0 | Supabase client library |
| bcryptjs | ^3.0.3 | Password hashing |
| cors | ^2.8.5 | CORS middleware |
| dotenv | ^17.2.3 | Loads environment variables from `.env` |
| express | ^5.1.0 | Web framework |
| fabric-ca-client | ^2.2.20 | Client for Fabric Certificate Authority |
| fabric-network | ^2.2.20 | Legacy client for Hyperledger Fabric |
| jsonwebtoken | ^9.0.2 | JSON Web Token implementation |
| multer | ^2.0.2 | Middleware for file uploads |
| node-cron | ^4.2.1 | Job scheduler |
| node-fetch | ^3.3.2 | `window.fetch` for Node.js |
| pg | ^8.16.3 | PostgreSQL client |
| puppeteer | ^24.34.0 | Headless Chrome for web scraping |
| serialport | ^13.0.0 | Access serial ports for IoT |
| twilio | ^5.11.1 | Twilio API client for SMS |

### Dev Dependencies
| Package | Version | Description |
|---|---|---|
| nodemon | ^3.1.11 | Monitors for changes and restarts the server |
