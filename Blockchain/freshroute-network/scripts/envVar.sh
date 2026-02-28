#!/bin/bash
#
# Copyright IBM Corp All Rights Reserved
#
# SPDX-License-Identifier: Apache-2.0
#

# This is a collection of bash functions used by different scripts

# imports
. scripts/utils.sh

export CORE_PEER_TLS_ENABLED=true
export FABRIC_CFG_PATH=${PWD}/config
export ORDERER_CA=${PWD}/organizations/ordererOrganizations/freshroute.com/tlsca/tlsca.freshroute.com-cert.pem
export PEER0_FARMER_CA=${PWD}/organizations/peerOrganizations/farmer.freshroute.com/tlsca/tlsca.farmer.freshroute.com-cert.pem
export PEER0_BUYER_CA=${PWD}/organizations/peerOrganizations/buyer.freshroute.com/tlsca/tlsca.buyer.freshroute.com-cert.pem
export PEER0_TRANSPORTER_CA=${PWD}/organizations/peerOrganizations/transporter.freshroute.com/tlsca/tlsca.transporter.freshroute.com-cert.pem
export ORDERER_ADMIN_TLS_SIGN_CERT=${PWD}/organizations/ordererOrganizations/freshroute.com/orderers/orderer.freshroute.com/tls/server.crt
export ORDERER_ADMIN_TLS_PRIVATE_KEY=${PWD}/organizations/ordererOrganizations/freshroute.com/orderers/orderer.freshroute.com/tls/server.key

# Set environment variables for the peer org
setGlobals() {
  local USING_ORG=""
  if [ -z "$OVERRIDE_ORG" ]; then
    USING_ORG=$1
  else
    USING_ORG="${OVERRIDE_ORG}"
  fi
  infoln "Using organization ${USING_ORG}"
  if [ $USING_ORG == "farmer" ]; then
    export CORE_PEER_LOCALMSPID="FarmerOrgMSP"
    export CORE_PEER_TLS_ROOTCERT_FILE=$PEER0_FARMER_CA
    export CORE_PEER_MSPCONFIGPATH=${PWD}/organizations/peerOrganizations/farmer.freshroute.com/users/Admin@farmer.freshroute.com/msp
    export CORE_PEER_ADDRESS=localhost:7051
  elif [ $USING_ORG == "buyer" ]; then
    export CORE_PEER_LOCALMSPID="BuyerOrgMSP"
    export CORE_PEER_TLS_ROOTCERT_FILE=$PEER0_BUYER_CA
    export CORE_PEER_MSPCONFIGPATH=${PWD}/organizations/peerOrganizations/buyer.freshroute.com/users/Admin@buyer.freshroute.com/msp
    export CORE_PEER_ADDRESS=localhost:9051
  elif [ $USING_ORG == "transporter" ]; then
    export CORE_PEER_LOCALMSPID="TransporterOrgMSP"
    export CORE_PEER_TLS_ROOTCERT_FILE=$PEER0_TRANSPORTER_CA
    export CORE_PEER_MSPCONFIGPATH=${PWD}/organizations/peerOrganizations/transporter.freshroute.com/users/Admin@transporter.freshroute.com/msp
    export CORE_PEER_ADDRESS=localhost:11051
  else
    errorln "ORG Unknown"
  fi

  if [ "$VERBOSE" == "true" ]; then
    env | grep CORE
  fi
}

# Set environment variables for use in the CLI container
setGlobalsCLI() {
  setGlobals $1

  local USING_ORG=""
  if [ -z "$OVERRIDE_ORG" ]; then
    USING_ORG=$1
  else
    USING_ORG="${OVERRIDE_ORG}"
  fi
  if [ $USING_ORG == "farmer" ]; then
    export CORE_PEER_ADDRESS=peer0.farmer.freshroute.com:7051
  elif [ $USING_ORG == "buyer" ]; then
    export CORE_PEER_ADDRESS=peer0.buyer.freshroute.com:9051
  elif [ $USING_ORG == "transporter" ]; then
    export CORE_PEER_ADDRESS=peer0.transporter.freshroute.com:11051
  else
    errorln "ORG Unknown"
  fi
}

# parsePeerConnectionParameters $@
# Helper function that sets the peer connection parameters for a chaincode operation
parsePeerConnectionParameters() {
  PEER_CONN_PARMS=()
  PEERS=""
  while [ "$#" -gt 0 ]; do
    setGlobals $1
    PEER="peer0.$1"
    ## Set peer addresses
    if [ -z "$PEERS" ]
    then
	PEERS="$PEER"
    else
	PEERS="$PEERS $PEER"
    fi
    PEER_CONN_PARMS=("${PEER_CONN_PARMS[@]}" --peerAddresses $CORE_PEER_ADDRESS)
    ## Set path to TLS certificate
    if [ $1 == "farmer" ]; then
      CA=$PEER0_FARMER_CA
    elif [ $1 == "buyer" ]; then
      CA=$PEER0_BUYER_CA
    elif [ $1 == "transporter" ]; then
      CA=$PEER0_TRANSPORTER_CA
    else
      errorln "ORG Unknown"
    fi

    PEER_CONN_PARMS=("${PEER_CONN_PARMS[@]}" --tlsRootCertFiles $CA)
    # shift by one to get to the next organization
    shift
  done
}

verifyResult() {
  if [ $1 -ne 0 ]; then
    fatalln "$2"
  fi
}
