#!/usr/bin/env bash
#
# SPDX-License-Identifier: Apache-2.0
#
# FreshRoute Chaincode-as-a-Service Deployment Script

source scripts/utils.sh

CHANNEL_NAME=${1:-"freshroute-channel"}
CC_NAME=${2}
CC_SRC_PATH=${3}
CCAAS_DOCKER_RUN=${4:-"true"}
CC_VERSION=${5:-"1.0"}
CC_SEQUENCE=${6:-"1"}
CC_INIT_FCN=${7:-"NA"}
CC_END_POLICY=${8:-"NA"}
CC_COLL_CONFIG=${9:-"NA"}
DELAY=${10:-"3"}
MAX_RETRY=${11:-"5"}
VERBOSE=${12:-"false"}

CCAAS_SERVER_PORT=9999

: ${CONTAINER_CLI:="docker"}
: ${CONTAINER_CLI_COMPOSE:="${CONTAINER_CLI} compose"}

infoln "Using ${CONTAINER_CLI} and ${CONTAINER_CLI_COMPOSE}"

println "Executing with the following parameters:"
println "- CHANNEL_NAME: ${C_GREEN}${CHANNEL_NAME}${C_RESET}"
println "- CC_NAME: ${C_GREEN}${CC_NAME}${C_RESET}"
println "- CC_SRC_PATH: ${C_GREEN}${CC_SRC_PATH}${C_RESET}"
println "- CC_VERSION: ${C_GREEN}${CC_VERSION}${C_RESET}"
println "- CC_SEQUENCE: ${C_GREEN}${CC_SEQUENCE}${C_RESET}"

FABRIC_CFG_PATH=$PWD/../config/

# Validate inputs
if [ -z "$CC_NAME" ] || [ "$CC_NAME" = "NA" ]; then
  fatalln "No chaincode name was provided."
elif [ -z "$CC_SRC_PATH" ] || [ "$CC_SRC_PATH" = "NA" ]; then
  fatalln "No chaincode path was provided."
elif [ ! -d "$CC_SRC_PATH" ]; then
  fatalln "Path to chaincode does not exist."
fi

if [ "$CC_END_POLICY" = "NA" ]; then
  # Production-grade endorsement policy: Require majority of all organizations
  # This ensures no single organization can manipulate the ledger
  CC_END_POLICY_VALUE="OR('FarmerOrgMSP.peer','BuyerOrgMSP.peer','TransporterOrgMSP.peer')"
  CC_END_POLICY="--signature-policy"
  infoln "Using production endorsement policy: Majority of organizations"
else
  CC_END_POLICY_VALUE="$CC_END_POLICY"
  CC_END_POLICY="--signature-policy"
fi

if [ "$CC_COLL_CONFIG" = "NA" ]; then
  CC_COLL_CONFIG=""
else
  CC_COLL_CONFIG="--collections-config $CC_COLL_CONFIG"
fi

# Import utilities
. scripts/envVar.sh
. scripts/ccutils.sh

packageChaincode() {
  address="{{.peername}}_${CC_NAME}_ccaas:${CCAAS_SERVER_PORT}"
  prefix=$(basename "$0")
  tempdir=$(mktemp -d -t "$prefix.XXXXXXXX") || fatalln "Error creating temporary directory"
  label=${CC_NAME}_${CC_VERSION}
  mkdir -p "$tempdir/src"

cat > "$tempdir/src/connection.json" <<CONN_EOF
{
  "address": "${address}",
  "dial_timeout": "10s",
  "tls_required": false
}
CONN_EOF

  mkdir -p "$tempdir/pkg"

cat << METADATA-EOF > "$tempdir/pkg/metadata.json"
{
    "type": "ccaas",
    "label": "$label"
}
METADATA-EOF

  tar -C "$tempdir/src" -czf "$tempdir/pkg/code.tar.gz" .
  tar -C "$tempdir/pkg" -czf "$CC_NAME.tar.gz" metadata.json code.tar.gz
  rm -Rf "$tempdir"

  PACKAGE_ID=$(peer lifecycle chaincode calculatepackageid ${CC_NAME}.tar.gz)
  
  successln "Chaincode is packaged ${address}"
}

buildDockerImages() {
  if [ "$CCAAS_DOCKER_RUN" = "true" ]; then
    infoln "Building Chaincode-as-a-Service docker image '${CC_NAME}' '${CC_SRC_PATH}'"
    infoln "This may take several minutes..."
    set -x
    ${CONTAINER_CLI} build -f $CC_SRC_PATH/Dockerfile -t ${CC_NAME}_ccaas_image:latest --build-arg CC_SERVER_PORT=9999 $CC_SRC_PATH >&log.txt
    res=$?
    { set +x; } 2>/dev/null
    cat log.txt
    
    if [ $res -ne 0 ]; then
      fatalln "Docker build of chaincode-as-a-service container failed"
    fi
    
    successln "Docker image '${CC_NAME}_ccaas_image:latest' built successfully"
  else
    infoln "Not building docker image"
  fi
}

startDockerContainer() {
  if [ "$CCAAS_DOCKER_RUN" = "true" ]; then
    infoln "Starting the Chaincode-as-a-Service docker containers..."
    
    # Start container for farmer org
    set -x
    ${CONTAINER_CLI} run --rm -d --name peer0farmer_${CC_NAME}_ccaas  \
                  --network fabric_freshroute \
                  -e CHAINCODE_SERVER_ADDRESS=0.0.0.0:${CCAAS_SERVER_PORT} \
                  -e CHAINCODE_ID=$PACKAGE_ID -e CORE_CHAINCODE_ID_NAME=$PACKAGE_ID \
                    ${CC_NAME}_ccaas_image:latest

    # Start container for buyer org
    ${CONTAINER_CLI} run  --rm -d --name peer0buyer_${CC_NAME}_ccaas \
                  --network fabric_freshroute \
                  -e CHAINCODE_SERVER_ADDRESS=0.0.0.0:${CCAAS_SERVER_PORT} \
                  -e CHAINCODE_ID=$PACKAGE_ID -e CORE_CHAINCODE_ID_NAME=$PACKAGE_ID \
                    ${CC_NAME}_ccaas_image:latest

    # Start container for transporter org
    ${CONTAINER_CLI} run  --rm -d --name peer0transporter_${CC_NAME}_ccaas \
                  --network fabric_freshroute \
                  -e CHAINCODE_SERVER_ADDRESS=0.0.0.0:${CCAAS_SERVER_PORT} \
                  -e CHAINCODE_ID=$PACKAGE_ID -e CORE_CHAINCODE_ID_NAME=$PACKAGE_ID \
                    ${CC_NAME}_ccaas_image:latest
    res=$?
    { set +x; } 2>/dev/null
    
    if [ $res -ne 0 ]; then
      fatalln "Failed to start chaincode containers"
    fi
    
    successln "Docker containers started successfully"
  else
    infoln "Not starting docker containers"
  fi
}

# Build the docker image 
buildDockerImages

# Package the chaincode
packageChaincode

# Install chaincode on all org peers
infoln "Installing chaincode on peer0.farmer..."
installChaincode farmer

infoln "Installing chaincode on peer0.buyer..."
installChaincode buyer

infoln "Installing chaincode on peer0.transporter..."
installChaincode transporter

resolveSequence

# Query whether the chaincode is installed
queryInstalled farmer

# Approve the chaincode definition for all orgs
approveForMyOrg farmer
approveForMyOrg buyer
approveForMyOrg transporter

# Now start the chaincode service BEFORE checking commit readiness
startDockerContainer

# Check commit readiness - all orgs should approve
checkCommitReadiness farmer "\"FarmerOrgMSP\": true" "\"BuyerOrgMSP\": true" "\"TransporterOrgMSP\": true"
checkCommitReadiness buyer "\"FarmerOrgMSP\": true" "\"BuyerOrgMSP\": true" "\"TransporterOrgMSP\": true"
checkCommitReadiness transporter "\"FarmerOrgMSP\": true" "\"BuyerOrgMSP\": true" "\"TransporterOrgMSP\": true"

# Commit the chaincode definition
commitChaincodeDefinition farmer buyer transporter

# Query on all peers to see that the chaincode definition was committed
queryCommitted farmer
queryCommitted buyer
queryCommitted transporter

# Invoke the chaincode - Initialize if needed
if [ "$CC_INIT_FCN" != "NA" ]; then
  chaincodeInvokeInit farmer buyer transporter
fi

successln "Chaincode '${CC_NAME}' deployed successfully on channel '${CHANNEL_NAME}'"

exit 0
