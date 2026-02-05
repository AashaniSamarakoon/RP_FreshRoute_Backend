#!/bin/bash

cd /mnt/d/Github/RP_FreshRoute_Backend/Blockchain/freshroute-network

# Clear any previous FABRIC_CFG_PATH
unset FABRIC_CFG_PATH

# Source the environment setup
source scripts/envVar.sh

export CHANNEL_NAME=freshroute-channel
export CC_NAME=freshroute

echo "🧪 FreshRoute Blockchain Test Suite"
echo "===================================="

# Test 1: Register Farmer
echo -e "\n📝 Test 1: Register Farmer User"
setGlobals farmer
peer chaincode invoke -o localhost:7050 --ordererTLSHostnameOverride orderer.freshroute.com \
  --tls --cafile "$ORDERER_CA" -C $CHANNEL_NAME -n $CC_NAME \
  -c '{"function":"UserContract:RegisterUser","Args":["farmer001","John Silva","farmer"]}' \
  --waitForEvent

sleep 2

# Test 2: Query Farmer
echo -e "\n🔍 Test 2: Query Farmer User"
peer chaincode query -C $CHANNEL_NAME -n $CC_NAME \
  -c '{"function":"UserContract:GetUser","Args":["farmer001"]}' | jq .

# Test 3: Create Harvest
echo -e "\n🌾 Test 3: Create Harvest"
peer chaincode invoke -o localhost:7050 --ordererTLSHostnameOverride orderer.freshroute.com \
  --tls --cafile "$ORDERER_CA" -C $CHANNEL_NAME -n $CC_NAME \
  -c '{"function":"StockContract:CreateHarvest","Args":["harvest001","mango","1000","250","[\"QmHash123\",\"QmHash456\"]"]}' \
  --waitForEvent

sleep 2

# Test 4: Query Harvest
echo -e "\n🔍 Test 4: Query Harvest"
peer chaincode query -C $CHANNEL_NAME -n $CC_NAME \
  -c '{"function":"StockContract:ReadHarvest","Args":["harvest001"]}' | jq .

# Test 5: Register Buyer
echo -e "\n📝 Test 5: Register Buyer User"
setGlobals buyer
peer chaincode invoke -o localhost:7050 --ordererTLSHostnameOverride orderer.freshroute.com \
  --tls --cafile "$ORDERER_CA" -C $CHANNEL_NAME -n $CC_NAME \
  -c '{"function":"UserContract:RegisterUser","Args":["buyer001","ABC Supermarket","buyer"]}' \
  --waitForEvent

sleep 2

# Test 6: Buyer Places Order
echo -e "\n🛒 Test 6: Buyer Places Order"
peer chaincode invoke -o localhost:7050 --ordererTLSHostnameOverride orderer.freshroute.com \
  --tls --cafile "$ORDERER_CA" -C $CHANNEL_NAME -n $CC_NAME \
  -c '{"function":"OrderContract:PlaceOrder","Args":["order001","mango","alphonso","A","500","2026-02-15"]}' \
  --waitForEvent

sleep 2

echo -e "\n✅ All tests completed! Check the output above."