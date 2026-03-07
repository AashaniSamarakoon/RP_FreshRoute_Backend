#!/usr/bin/env bash

# imports  
. scripts/envVar.sh
. scripts/utils.sh

CHANNEL_NAME="$1"
DELAY="$2"
MAX_RETRY="$3"
VERBOSE="$4"
: ${CHANNEL_NAME:="freshroute-channel"}
: ${DELAY:="3"}
: ${MAX_RETRY:="5"}
: ${VERBOSE:="false"}

: ${CONTAINER_CLI:="docker"}
: ${CONTAINER_CLI_COMPOSE:="${CONTAINER_CLI} compose"}

infoln "Using ${CONTAINER_CLI} and ${CONTAINER_CLI_COMPOSE}"

if [ ! -d "channel-artifacts" ]; then
	mkdir channel-artifacts
fi

createChannelGenesisBlock() {
	which configtxgen
	if [ "$?" -ne 0 ]; then
		fatalln "configtxgen tool not found."
	fi
	
	set -x
	configtxgen -profile FreshRouteChannel -outputBlock ./channel-artifacts/${CHANNEL_NAME}.block -channelID $CHANNEL_NAME
	res=$?
	{ set +x; } 2>/dev/null
	
	if [ $res -ne 0 ]; then
		fatalln "Failed to generate channel configuration transaction..."
	fi
}

createChannel() {
	local rc=1
	local COUNTER=1
	
	infoln "Adding orderers to channel"
	while [ $rc -ne 0 -a $COUNTER -lt $MAX_RETRY ] ; do
		sleep $DELAY
		set -x
		osnadmin channel join --channelID $CHANNEL_NAME --config-block ./channel-artifacts/${CHANNEL_NAME}.block -o localhost:7053 --ca-file "$ORDERER_CA" --client-cert "$ORDERER_ADMIN_TLS_SIGN_CERT" --client-key "$ORDERER_ADMIN_TLS_PRIVATE_KEY" >&log.txt
		res=$?
		{ set +x; } 2>/dev/null
		let rc=$res
		COUNTER=$(expr $COUNTER + 1)
	done
	cat log.txt
	
	if [ $res -ne 0 ]; then
		fatalln "Channel creation failed"
	fi
	
	# Join orderer2
	set -x
	osnadmin channel join --channelID $CHANNEL_NAME --config-block ./channel-artifacts/${CHANNEL_NAME}.block -o localhost:7055 --ca-file "$ORDERER_CA" --client-cert "${PWD}/organizations/ordererOrganizations/freshroute.com/orderers/orderer2.freshroute.com/tls/server.crt" --client-key "${PWD}/organizations/ordererOrganizations/freshroute.com/orderers/orderer2.freshroute.com/tls/server.key" >&log.txt
	res=$?
	{ set +x; } 2>/dev/null
	
	# Join orderer3
	set -x
	osnadmin channel join --channelID $CHANNEL_NAME --config-block ./channel-artifacts/${CHANNEL_NAME}.block -o localhost:7058 --ca-file "$ORDERER_CA" --client-cert "${PWD}/organizations/ordererOrganizations/freshroute.com/orderers/orderer3.freshroute.com/tls/server.crt" --client-key "${PWD}/organizations/ordererOrganizations/freshroute.com/orderers/orderer3.freshroute.com/tls/server.key" >&log.txt
	res=$?
	{ set +x; } 2>/dev/null
}

# joinChannel ORG
joinChannel() {
	ORG=$1
	FABRIC_CFG_PATH=$PWD/../config/
	setGlobals $ORG
	local rc=1
	local COUNTER=1
	
	## Sometimes Join takes time, hence retry
	while [ $rc -ne 0 -a $COUNTER -lt $MAX_RETRY ] ; do
		sleep $DELAY
		set -x
		peer channel join -b $BLOCKFILE >&log.txt
		res=$?
		{ set +x; } 2>/dev/null
		let rc=$res
		COUNTER=$(expr $COUNTER + 1)
	done
	cat log.txt
	
	if [ $res -ne 0 ]; then
		fatalln "After $MAX_RETRY attempts, peer0.$ORG has failed to join channel '$CHANNEL_NAME'"
	fi
}

setAnchorPeer() {
	ORG=$1
	. scripts/setAnchorPeer.sh $ORG $CHANNEL_NAME 
}

## Create channel genesis block
FABRIC_CFG_PATH=$PWD/../config/
BLOCKFILE="./channel-artifacts/${CHANNEL_NAME}.block"

infoln "Generating channel genesis block '${CHANNEL_NAME}.block'"
FABRIC_CFG_PATH=${PWD}/configtx
createChannelGenesisBlock

## Create channel
infoln "Creating channel ${CHANNEL_NAME}"
createChannel
successln "Channel '$CHANNEL_NAME' created"

## Join all the peers to the channel
infoln "Joining farmer org peer to the channel..."
joinChannel farmer

infoln "Joining buyer org peer to the channel..."
joinChannel buyer

infoln "Joining transporter org peer to the channel..."
joinChannel transporter

## Set the anchor peers for each org in the channel
infoln "Setting anchor peer for farmer org..."
setAnchorPeer farmer

infoln "Setting anchor peer for buyer org..."
setAnchorPeer buyer

infoln "Setting anchor peer for transporter org..."
setAnchorPeer transporter

successln "Channel '$CHANNEL_NAME' joined"
