#!/bin/bash
#
# Complete FreshRoute Network Startup
# This script starts the full production network with CAs, orderers, peers, and CouchDB
#

set -e

echo "=========================================="
echo " FreshRoute Network - Complete Startup"
echo "=========================================="
echo

# Navigate to network directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Step 1: Start the infrastructure
echo "Step 1: Starting network infrastructure..."
./network.sh up

# Step 2: Create channel
echo
echo "Step 2: Creating channel..."
./network.sh createChannel

# Step 3: Deploy chaincode
echo
echo "Step 3: Deploying chaincode..."
./scripts/deployCCAAS.sh

# Step 4: Start API Gateway (optional)
read -p "Do you want to start the API Gateway? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]
then
    echo "Step 4: Starting API Gateway..."
    cd api-gateway
    
    # Enroll admin if wallet doesn't exist
    if [ ! -d "wallet" ]; then
        echo "Enrolling admin for all organizations..."
        ORG_NAME=farmer node src/enrollUser.js admin
        ORG_NAME=buyer node src/enrollUser.js admin
        ORG_NAME=transporter node src/enrollUser.js admin
    fi
    
    npm start &
    API_PID=$!
    echo "API Gateway started with PID: $API_PID"
fi

echo
echo "=========================================="
echo "  FreshRoute Network is Ready!"
echo "=========================================="
echo
echo "Network Status:"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep -E "freshroute|NAME"
echo
echo "Next Steps:"
echo "  - Run health check: ./scripts/healthcheck.sh"
echo "  - View logs: docker logs <container-name>"
echo "  - API Gateway: http://localhost:3000"
echo "  - Stop network: ./network.sh down"
echo
