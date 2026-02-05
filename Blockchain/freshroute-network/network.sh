#!/usr/bin/env bash
#
# Copyright IBM Corp All Rights Reserved
#
# SPDX-License-Identifier: Apache-2.0
#
# FreshRoute Production Network Setup Script
# Organizations: FarmerOrg, BuyerOrg, TransporterOrg
#

ROOTDIR=$(cd "$(dirname "$0")" && pwd)
export PATH=${ROOTDIR}/../bin:${PWD}/../bin:$PATH
export FABRIC_CFG_PATH=${PWD}/configtx
export VERBOSE=false

pushd ${ROOTDIR} > /dev/null
trap "popd > /dev/null" EXIT

. scripts/utils.sh

: ${CONTAINER_CLI:="docker"}
: ${CONTAINER_CLI_COMPOSE:="${CONTAINER_CLI} compose"}

infoln "Using ${CONTAINER_CLI} and ${CONTAINER_CLI_COMPOSE}"

# Obtain CONTAINER_IDS and remove them
function clearContainers() {
  infoln "Removing remaining containers"
  ${CONTAINER_CLI} rm -f $(${CONTAINER_CLI} ps -aq --filter label=service=hyperledger-fabric) 2>/dev/null || true
  ${CONTAINER_CLI} rm -f $(${CONTAINER_CLI} ps -aq --filter name='dev-peer*') 2>/dev/null || true
  ${CONTAINER_CLI} kill "$(${CONTAINER_CLI} ps -q --filter name=ccaas)" 2>/dev/null || true
}

# Delete any images that were generated as a part of this setup
function removeUnwantedImages() {
  infoln "Removing generated chaincode docker images"
  ${CONTAINER_CLI} image rm -f $(${CONTAINER_CLI} images -aq --filter reference='dev-peer*') 2>/dev/null || true
}

# Versions of fabric known not to work with the test network
NONWORKING_VERSIONS="^1\.0\. ^1\.1\. ^1\.2\. ^1\.3\. ^1\.4\."

# Check if peer binaries and configuration files exist
function checkPrereqs() {
  peer version > /dev/null 2>&1

  if [[ $? -ne 0 || ! -d "../config" ]]; then
    errorln "Peer binary and configuration files not found.."
    errorln
    errorln "Follow the instructions in the Fabric docs to install the Fabric Binaries:"
    errorln "https://hyperledger-fabric.readthedocs.io/en/latest/install.html"
    exit 1
  fi

  LOCAL_VERSION=$(peer version | sed -ne 's/^ Version: //p')
  DOCKER_IMAGE_VERSION=$(${CONTAINER_CLI} run --rm hyperledger/fabric-peer:2.5.9 peer version | sed -ne 's/^ Version: //p')

  infoln "LOCAL_VERSION=$LOCAL_VERSION"
  infoln "DOCKER_IMAGE_VERSION=$DOCKER_IMAGE_VERSION"

  if [ "$LOCAL_VERSION" != "$DOCKER_IMAGE_VERSION" ]; then
    warnln "Local fabric binaries and docker images are out of sync. This may cause problems."
  fi

  for UNSUPPORTED_VERSION in $NONWORKING_VERSIONS; do
    echo "$LOCAL_VERSION" | grep -q $UNSUPPORTED_VERSION
    if [ $? -eq 0 ]; then
      fatalln "Local Fabric binary version of $LOCAL_VERSION does not match the versions supported by the network."
    fi

    echo "$DOCKER_IMAGE_VERSION" | grep -q $UNSUPPORTED_VERSION
    if [ $? -eq 0 ]; then
      fatalln "Fabric Docker image version of $DOCKER_IMAGE_VERSION does not match the versions supported by the network."
    fi
  done
}

# Before you can bring up a network, each organization needs to generate crypto material
function createOrgs() {
  if [ -d "organizations/peerOrganizations" ]; then
    rm -Rf organizations/peerOrganizations && rm -Rf organizations/ordererOrganizations
  fi

  # Create crypto material using cryptogen
  which cryptogen
  if [ "$?" -ne 0 ]; then
    fatalln "cryptogen tool not found. exiting"
  fi
  
  infoln "Generating certificates using cryptogen tool"

  infoln "Creating FarmerOrg Identities"
  set -x
  cryptogen generate --config=./organizations/cryptogen/crypto-config-farmer.yaml --output="organizations"
  res=$?
  { set +x; } 2>/dev/null
  if [ $res -ne 0 ]; then
    fatalln "Failed to generate certificates..."
  fi

  infoln "Creating BuyerOrg Identities"
  set -x
  cryptogen generate --config=./organizations/cryptogen/crypto-config-buyer.yaml --output="organizations"
  res=$?
  { set +x; } 2>/dev/null
  if [ $res -ne 0 ]; then
    fatalln "Failed to generate certificates..."
  fi

  infoln "Creating TransporterOrg Identities"
  set -x
  cryptogen generate --config=./organizations/cryptogen/crypto-config-transporter.yaml --output="organizations"
  res=$?
  { set +x; } 2>/dev/null
  if [ $res -ne 0 ]; then
    fatalln "Failed to generate certificates..."
  fi

  infoln "Creating Orderer Org Identities"
  set -x
  cryptogen generate --config=./organizations/cryptogen/crypto-config-orderer.yaml --output="organizations"
  res=$?
  { set +x; } 2>/dev/null
  if [ $res -ne 0 ]; then
    fatalln "Failed to generate certificates..."
  fi

  infoln "Generating CCP files for FarmerOrg, BuyerOrg, and TransporterOrg"
  ./organizations/ccp-generate.sh
}

# Generate orderer system channel genesis block
function createConsortium() {
  which configtxgen
  if [ "$?" -ne 0 ]; then
    fatalln "configtxgen tool not found."
  fi

  infoln "Generating Orderer Genesis block"

  set -x
  configtxgen -profile FreshRouteGenesis -channelID system-channel -outputBlock ./system-genesis-block/genesis.block
  res=$?
  { set +x; } 2>/dev/null
  if [ $res -ne 0 ]; then
    fatalln "Failed to generate orderer genesis block..."
  fi
}

# Bring up the peer and orderer nodes using docker compose
function networkUp() {
  checkPrereqs
  
  if [ ! -d "organizations/peerOrganizations" ]; then
    infoln "Generating certificates for network organizations"
    createOrgs
  fi

  if [ ! -d "system-genesis-block" ] || [ ! -f "./system-genesis-block/genesis.block" ]; then
    infoln "Generating genesis block for orderer"
    createConsortium
  fi

  COMPOSE_FILES="-f compose/docker/docker-compose-freshroute.yaml"
  
  DOCKER_SOCK="${DOCKER_SOCK}" ${CONTAINER_CLI_COMPOSE} ${COMPOSE_FILES} up -d 2>&1

  $CONTAINER_CLI ps -a
  if [ $? -ne 0 ]; then
    fatalln "Unable to start network"
  fi
}

# Call the script to create the channel
function createChannel() {
  scripts/createChannel.sh $CHANNEL_NAME $CLI_DELAY $MAX_RETRY $VERBOSE
  if [ $? -ne 0 ]; then
    fatalln "Create channel failed"
  fi
}

# Call the script to deploy chaincode to the channel
function deployCC() {
  scripts/deployCC.sh $CHANNEL_NAME $CC_NAME $CC_SRC_PATH $CC_SRC_LANGUAGE $CC_VERSION $CC_SEQUENCE $CC_INIT_FCN $CC_END_POLICY $CC_COLL_CONFIG $CLI_DELAY $MAX_RETRY $VERBOSE
  if [ $? -ne 0 ]; then
    fatalln "Deploying chaincode failed"
  fi
}

# Call the script to deploy chaincode-as-a-service to the channel  
function deployCCAAS() {
  scripts/deployCCAAS.sh $CHANNEL_NAME $CC_NAME $CC_SRC_PATH $CCAAS_DOCKER_RUN $CC_VERSION $CC_SEQUENCE $CC_INIT_FCN $CC_END_POLICY $CC_COLL_CONFIG $CLI_DELAY $MAX_RETRY $VERBOSE $CCAAS_DOCKER_RUN
  if [ $? -ne 0 ]; then
    fatalln "Deploying chaincode-as-a-service failed"
  fi
}

# Tear down running network
function networkDown() {
  COMPOSE_FILES="-f compose/docker/docker-compose-freshroute.yaml"
  
  if [ "${CONTAINER_CLI}" == "docker" ]; then
    ${CONTAINER_CLI_COMPOSE} ${COMPOSE_FILES} down --volumes --remove-orphans
  else
    fatalln "Container CLI ${CONTAINER_CLI} not supported"
  fi

  # Don't remove the generated artifacts -- note, the ledgers are always removed
  if [ "$MODE" != "restart" ]; then
    # Remove docker volumes
    ${CONTAINER_CLI} volume rm $(${CONTAINER_CLI} volume ls -q --filter name=freshroute) 2>/dev/null || true
    
    # Cleanup the chaincode containers
    clearContainers
    
    # Cleanup images
    removeUnwantedImages
    
    # Remove orderer block and other channel configuration transactions and certs
    rm -rf system-genesis-block/*.block organizations/peerOrganizations organizations/ordererOrganizations
    rm -rf channel-artifacts/*.block channel-artifacts/*.tx
  fi
}

# Defaults
CHANNEL_NAME="freshroute-channel"
CC_NAME="freshroute"
CC_SRC_LANGUAGE="typescript"
CC_VERSION="1.0"
CC_SEQUENCE="1"
CC_INIT_FCN="NA"
CC_END_POLICY="NA"
CC_COLL_CONFIG="NA"
CC_SRC_PATH="NA"
CLI_DELAY=3
MAX_RETRY=5
VERBOSE=false
CCAAS_DOCKER_RUN=true

# Parse commandline args
if [[ $# -lt 1 ]] ; then
  echo "Usage: ./network.sh <Mode> [Flags]"
  echo "Modes:"
  echo "  up         - Bring up the FreshRoute network"
  echo "  down       - Clear the FreshRoute network"
  echo "  restart    - Restart the FreshRoute network"
  echo "  createChannel - Create a channel"
  echo "  deployCC   - Deploy chaincode"
  echo "  deployCCAAS - Deploy chaincode-as-a-service"
  echo ""
  echo "Flags:"
  echo "  -c <channel name> - Channel name to use (default: freshroute-channel)"
  echo "  -ccn <name> - Chaincode name"
  echo "  -ccl <language> - Programming language of chaincode (go, java, javascript, typescript)"
  echo "  -ccv <version> - Chaincode version (default: 1.0)"
  echo "  -ccs <sequence> - Chaincode sequence (default: 1)"
  echo "  -ccp <path> - Path to chaincode"
  echo "  -verbose - Verbose mode"
  exit 0
else
  MODE=$1
  shift
fi

# Parse flags
while [[ $# -ge 1 ]] ; do
  key="$1"
  case $key in
  -h )
    echo "Help..."
    exit 0
    ;;
  -c )
    CHANNEL_NAME="$2"
    shift
    ;;
  -r )
    MAX_RETRY="$2"
    shift
    ;;
  -d )
    CLI_DELAY="$2"
    shift
    ;;
  -ccl )
    CC_SRC_LANGUAGE="$2"
    shift
    ;;
  -ccn )
    CC_NAME="$2"
    shift
    ;;
  -ccv )
    CC_VERSION="$2"
    shift
    ;;
  -ccs )
    CC_SEQUENCE="$2"
    shift
    ;;
  -ccp )
    CC_SRC_PATH="$2"
    shift
    ;;
  -ccep )
    CC_END_POLICY="$2"
    shift
    ;;
  -cccg )
    CC_COLL_CONFIG="$2"
    shift
    ;;
  -cci )
    CC_INIT_FCN="$2"
    shift
    ;;
  -verbose )
    VERBOSE=true
    ;;
  * )
    errorln "Unknown flag: $key"
    exit 1
    ;;
  esac
  shift
done

# Determine mode of operation
if [ "$MODE" == "up" ]; then
  infoln "Starting FreshRoute network"
  networkUp
elif [ "$MODE" == "createChannel" ]; then
  infoln "Creating channel '${CHANNEL_NAME}'."
  createChannel
elif [ "$MODE" == "down" ]; then
  infoln "Stopping FreshRoute network"
  networkDown
elif [ "$MODE" == "restart" ]; then
  infoln "Restarting FreshRoute network"
  networkDown
  networkUp
elif [ "$MODE" == "deployCC" ]; then
  infoln "Deploying chaincode on channel '${CHANNEL_NAME}'"
  deployCC
elif [ "$MODE" == "deployCCAAS" ]; then
  infoln "Deploying chaincode-as-a-service on channel '${CHANNEL_NAME}'"
  deployCCAAS
else
  echo "Unknown mode: $MODE"
  exit 1
fi
