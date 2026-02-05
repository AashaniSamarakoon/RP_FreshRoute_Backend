#!/usr/bin/env bash
#
# Copyright IBM Corp. All Rights Reserved.
#
# SPDX-License-Identifier: Apache-2.0
#

# import utils
FRESHROUTE_NETWORK_HOME=${FRESHROUTE_NETWORK_HOME:-${PWD}}
. ${FRESHROUTE_NETWORK_HOME}/scripts/configUpdate.sh

# NOTE: This requires jq and configtxlator for execution.
createAnchorPeerUpdate() {
  infoln "Fetching channel config for channel $CHANNEL_NAME"
  fetchChannelConfig $ORG $CHANNEL_NAME ${FRESHROUTE_NETWORK_HOME}/channel-artifacts/${CORE_PEER_LOCALMSPID}config.json

  infoln "Generating anchor peer update transaction for ${ORG} on channel $CHANNEL_NAME"

  if [ $ORG == "farmer" ]; then
    HOST="peer0.farmer.freshroute.com"
    PORT=7051
  elif [ $ORG == "buyer" ]; then
    HOST="peer0.buyer.freshroute.com"
    PORT=9051
  elif [ $ORG == "transporter" ]; then
    HOST="peer0.transporter.freshroute.com"
    PORT=11051
  else
    errorln "Org${ORG} unknown"
  fi

  set -x
  # Modify the configuration to append the anchor peer 
  jq '.channel_group.groups.Application.groups.'${CORE_PEER_LOCALMSPID}'.values += {"AnchorPeers":{"mod_policy": "Admins","value":{"anchor_peers": [{"host": "'$HOST'","port": '$PORT'}]},"version": "0"}}' ${FRESHROUTE_NETWORK_HOME}/channel-artifacts/${CORE_PEER_LOCALMSPID}config.json > ${FRESHROUTE_NETWORK_HOME}/channel-artifacts/${CORE_PEER_LOCALMSPID}modified_config.json
  res=$?
  { set +x; } 2>/dev/null
  
  if [ $res -ne 0 ]; then
    fatalln "Channel configuration update for anchor peer failed, make sure you have jq installed"
  fi

  # Compute a config update, based on the differences between 
  # {orgmsp}config.json and {orgmsp}modified_config.json, write
  # it as a transaction to {orgmsp}anchors.tx
  createConfigUpdate ${CHANNEL_NAME} ${FRESHROUTE_NETWORK_HOME}/channel-artifacts/${CORE_PEER_LOCALMSPID}config.json ${FRESHROUTE_NETWORK_HOME}/channel-artifacts/${CORE_PEER_LOCALMSPID}modified_config.json ${FRESHROUTE_NETWORK_HOME}/channel-artifacts/${CORE_PEER_LOCALMSPID}anchors.tx
}

updateAnchorPeer() {
  peer channel update -o localhost:7050 --ordererTLSHostnameOverride orderer.freshroute.com -c $CHANNEL_NAME -f ${FRESHROUTE_NETWORK_HOME}/channel-artifacts/${CORE_PEER_LOCALMSPID}anchors.tx --tls --cafile "$ORDERER_CA" >&log.txt
  res=$?
  cat log.txt
  
  if [ $res -ne 0 ]; then
    fatalln "Anchor peer update failed"
  fi
  
  successln "Anchor peer set for org '$CORE_PEER_LOCALMSPID' on channel '$CHANNEL_NAME'"
}

ORG=$1
CHANNEL_NAME=$2

setGlobals $ORG

createAnchorPeerUpdate 

updateAnchorPeer
