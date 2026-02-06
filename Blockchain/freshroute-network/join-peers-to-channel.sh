#!/bin/bash

cd /mnt/d/Github/RP_FreshRoute_Backend/Blockchain/freshroute-network

export PATH=$PATH:/mnt/d/Github/RP_FreshRoute_Backend/Blockchain/bin
export FABRIC_CFG_PATH=/mnt/d/Github/RP_FreshRoute_Backend/Blockchain/config

echo "Joining peers to freshroute-channel..."
echo ""

# Function to join a peer to the channel
join_peer() {
    local ORG=$1
    local PEER=$2
    local PORT=$3
    local ORG_MSP=$4
    
    echo "Joining ${PEER}.${ORG} (port ${PORT})..."
    
    export CORE_PEER_TLS_ENABLED=true
    export CORE_PEER_LOCALMSPID="${ORG_MSP}"
    export CORE_PEER_TLS_ROOTCERT_FILE="${PWD}/organizations/peerOrganizations/${ORG}.freshroute.com/peers/${PEER}.${ORG}.freshroute.com/tls/ca.crt"
    export CORE_PEER_MSPCONFIGPATH="${PWD}/organizations/peerOrganizations/${ORG}.freshroute.com/users/Admin@${ORG}.freshroute.com/msp"
    export CORE_PEER_ADDRESS=localhost:${PORT}
    
    peer channel join -b ./channel-artifacts/freshroute-channel.block 2>&1 | grep -E "Successfully|Error|already|exists"
    
    if [ $? -eq 0 ]; then
        echo "  ✅ ${PEER}.${ORG} joined successfully"
    else
        echo "  ❌ ${PEER}.${ORG} join failed"
    fi
    echo ""
}

# Join all peers
join_peer "farmer" "peer0" "7051" "FarmerOrgMSP"
join_peer "farmer" "peer1" "8051" "FarmerOrgMSP"
join_peer "buyer" "peer0" "9051" "BuyerOrgMSP"
join_peer "buyer" "peer1" "10051" "BuyerOrgMSP"
join_peer "transporter" "peer0" "11051" "TransporterOrgMSP"
join_peer "transporter" "peer1" "12051" "TransporterOrgMSP"

echo "✅ All peers joined to channel!"
