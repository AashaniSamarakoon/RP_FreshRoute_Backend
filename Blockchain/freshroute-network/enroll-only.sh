#!/bin/bash

# Set up environment
export PATH=/mnt/d/Github/RP_FreshRoute_Backend/Blockchain/bin:$PATH
export FABRIC_CA_CLIENT_HOME=/mnt/d/Github/RP_FreshRoute_Backend/Blockchain/freshroute-network/organizations

cd /mnt/d/Github/RP_FreshRoute_Backend/Blockchain/freshroute-network

# Step 1: Start CAs
echo "Starting CAs..."
docker compose -f compose/docker/docker-compose-ca.yaml up -d
sleep 5
echo "✅ CAs started"
echo ""

# Step 2: Source the enrollment script
echo "Sourcing enrollment functions..."
.  organizations/fabric-ca/registerEnroll-freshroute.sh

# Step 3: Enroll all organizations
echo "Creating farmer organization..."
createFarmer
echo "✅ Farmer org created"
echo ""

echo "Creating buyer organization..."
createBuyer
echo "✅ Buyer org created"
echo ""

echo "Creating transporter organization..."
createTransporter
echo "✅ Transporter org created"
echo ""

echo "Creating orderer organization..."
createOrderer
echo "✅ Orderer org created"
echo ""

echo "=========================================="
echo "✅ All identities enrolled!"
echo "=========================================="
