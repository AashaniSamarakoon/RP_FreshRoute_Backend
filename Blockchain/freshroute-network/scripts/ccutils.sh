#!/usr/bin/env bash

# installChaincode ORG
function installChaincode() {
  ORG=$1
  setGlobals $ORG
  set -x
  peer lifecycle chaincode queryinstalled --output json | jq -r 'try (.installed_chaincodes[].package_id)' | grep ^${PACKAGE_ID}$ >&log.txt
  if test $? -ne 0; then
    peer lifecycle chaincode install ${CC_NAME}.tar.gz >&log.txt
    res=$?
  fi
  { set +x; } 2>/dev/null
  cat log.txt
  
  if [ $res -ne 0 ]; then
    fatalln "Chaincode installation on peer0.$ORG has failed"
  fi
  
  successln "Chaincode is installed on peer0.$ORG"
}

# queryInstalled ORG
function queryInstalled() {
  ORG=$1
  setGlobals $ORG
  set -x
  peer lifecycle chaincode queryinstalled --output json | jq -r 'try (.installed_chaincodes[].package_id)' | grep ^${PACKAGE_ID}$ >&log.txt
  res=$?
  { set +x; } 2>/dev/null
  cat log.txt
  
  if [ $res -ne 0 ]; then
    fatalln "Query installed on peer0.$ORG has failed"
  fi
  
  successln "Query installed successful on peer0.$ORG on channel"
}

# approveForMyOrg ORG
function approveForMyOrg() {
  ORG=$1
  setGlobals $ORG
  set -x
  peer lifecycle chaincode approveformyorg -o localhost:7050 --ordererTLSHostnameOverride orderer.freshroute.com --tls --cafile "$ORDERER_CA" --channelID $CHANNEL_NAME --name ${CC_NAME} --version ${CC_VERSION} --package-id ${PACKAGE_ID} --sequence ${CC_SEQUENCE} ${INIT_REQUIRED} ${CC_END_POLICY} "${CC_END_POLICY_VALUE}" ${CC_COLL_CONFIG} >&log.txt
  res=$?
  { set +x; } 2>/dev/null
  cat log.txt
  
  if [ $res -ne 0 ]; then
    fatalln "Chaincode definition approved on peer0.$ORG on channel '$CHANNEL_NAME' failed"
  fi
  
  successln "Chaincode definition approved on peer0.$ORG on channel '$CHANNEL_NAME'"
}

# checkCommitReadiness ORG
function checkCommitReadiness() {
  ORG=$1
  shift 1
  setGlobals $ORG
  infoln "Checking the commit readiness of the chaincode definition on peer0.$ORG on channel '$CHANNEL_NAME'..."
  local rc=1
  local COUNTER=1
  
  while [ $rc -ne 0 -a $COUNTER -lt $MAX_RETRY ]; do
    sleep $DELAY
    infoln "Attempting to check the commit readiness of the chaincode definition on peer0.$ORG, Retry after $DELAY seconds."
    set -x
    peer lifecycle chaincode checkcommitreadiness --channelID $CHANNEL_NAME --name ${CC_NAME} --version ${CC_VERSION} --sequence ${CC_SEQUENCE} ${INIT_REQUIRED} ${CC_END_POLICY} "${CC_END_POLICY_VALUE}" ${CC_COLL_CONFIG} --output json >&log.txt
    res=$?
    { set +x; } 2>/dev/null
    let rc=0
    for var in "$@"; do
      grep "$var" log.txt &>/dev/null || let rc=1
    done
    COUNTER=$(expr $COUNTER + 1)
  done
  cat log.txt
  
  if test $rc -eq 0; then
    infoln "Checking the commit readiness of the chaincode definition successful on peer0.$ORG on channel '$CHANNEL_NAME'"
  else
    fatalln "After $MAX_RETRY attempts, Check commit readiness result on peer0.$ORG is INVALID!"
  fi
}

# commitChaincodeDefinition ORG1 ORG2 ORG3...
function commitChaincodeDefinition() {
  parsePeerConnectionParameters $@
  res=$?
  
  if [ $res -ne 0 ]; then
    fatalln "Invoke transaction failed on channel '$CHANNEL_NAME' due to uneven number of peer and org parameters"
  fi

  set -x
  peer lifecycle chaincode commit -o localhost:7050 --ordererTLSHostnameOverride orderer.freshroute.com --tls --cafile "$ORDERER_CA" --channelID $CHANNEL_NAME --name ${CC_NAME} "${PEER_CONN_PARMS[@]}" --version ${CC_VERSION} --sequence ${CC_SEQUENCE} ${INIT_REQUIRED} ${CC_END_POLICY} "${CC_END_POLICY_VALUE}" ${CC_COLL_CONFIG} >&log.txt
  res=$?
  { set +x; } 2>/dev/null
  cat log.txt
  
  if [ $res -ne 0 ]; then
    fatalln "Chaincode definition commit failed on channel '$CHANNEL_NAME'"
  fi
  
  successln "Chaincode definition committed on channel '$CHANNEL_NAME'"
}

# queryCommitted ORG
function queryCommitted() {
  ORG=$1
  setGlobals $ORG
  EXPECTED_RESULT="Version: ${CC_VERSION}, Sequence: ${CC_SEQUENCE}, Endorsement Plugin: escc, Validation Plugin: vscc"
  infoln "Querying chaincode definition on peer0.$ORG on channel '$CHANNEL_NAME'..."
  local rc=1
  local COUNTER=1
  
  while [ $rc -ne 0 -a $COUNTER -lt $MAX_RETRY ]; do
    sleep $DELAY
    infoln "Attempting to Query committed status on peer0.$ORG, Retry after $DELAY seconds."
    set -x
    peer lifecycle chaincode querycommitted --channelID $CHANNEL_NAME --name ${CC_NAME} >&log.txt
    res=$?
    { set +x; } 2>/dev/null
    test $res -eq 0 && VALUE=$(cat log.txt | grep -o '^Version: '$CC_VERSION', Sequence: [0-9]*, Endorsement Plugin: escc, Validation Plugin: vscc')
    test "$VALUE" = "$EXPECTED_RESULT" && let rc=0
    COUNTER=$(expr $COUNTER + 1)
  done
  cat log.txt
  
  if test $rc -eq 0; then
    successln "Query chaincode definition successful on peer0.$ORG on channel '$CHANNEL_NAME'"
  else
    fatalln "After $MAX_RETRY attempts, Query chaincode definition result on peer0.$ORG is INVALID!"
  fi
}

function chaincodeInvokeInit() {
  parsePeerConnectionParameters $@
  res=$?
  
  if [ $res -ne 0 ]; then
    fatalln "Invoke transaction failed on channel '$CHANNEL_NAME' due to uneven number of peer and org parameters"
  fi

  local rc=1
  local COUNTER=1
  local fcn_call='{"function":"'${CC_INIT_FCN}'","Args":[]}'
  
  while [ $rc -ne 0 -a $COUNTER -lt $MAX_RETRY ]; do
    sleep $DELAY
    set -x
    infoln "invoke fcn call:${fcn_call}"
    peer chaincode invoke -o localhost:7050 --ordererTLSHostnameOverride orderer.freshroute.com --tls --cafile "$ORDERER_CA" -C $CHANNEL_NAME -n ${CC_NAME} "${PEER_CONN_PARMS[@]}" --isInit -c ${fcn_call} >&log.txt
    res=$?
    { set +x; } 2>/dev/null
    let rc=$res
    COUNTER=$(expr $COUNTER + 1)
  done
  cat log.txt
  
  if [ $res -ne 0 ]; then
    fatalln "Invoke execution on $PEERS failed"
  fi
  
  successln "Invoke transaction successful on $PEERS on channel '$CHANNEL_NAME'"
}

function chaincodeQuery() {
  ORG=$1
  setGlobals $ORG
  infoln "Querying on peer0.$ORG on channel '$CHANNEL_NAME'..."
  local rc=1
  local COUNTER=1
  
  while [ $rc -ne 0 -a $COUNTER -lt $MAX_RETRY ]; do
    sleep $DELAY
    infoln "Attempting to Query peer0.$ORG, Retry after $DELAY seconds."
    set -x
    peer chaincode query -C $CHANNEL_NAME -n ${CC_NAME} -c '{"Args":["org.hyperledger.fabric:GetMetadata"]}' >&log.txt
    res=$?
    { set +x; } 2>/dev/null
    let rc=$res
    COUNTER=$(expr $COUNTER + 1)
  done
  cat log.txt
  
  if test $rc -eq 0; then
    successln "Query successful on peer0.$ORG on channel '$CHANNEL_NAME'"
  else
    fatalln "After $MAX_RETRY attempts, Query result on peer0.$ORG is INVALID!"
  fi
}

# Resolve the sequence from what is on the channel
function resolveSequence() {
  setGlobals farmer
  
  set -x
  peer lifecycle chaincode querycommitted --channelID $CHANNEL_NAME --name ${CC_NAME} >&log.txt
  res=$?
  { set +x; } 2>/dev/null
  
  if test $res -eq 0; then
    # chaincode is already committed on the channel, get the sequence
    COMMITTED_SEQUENCE=$(cat log.txt | grep -o 'Sequence: [0-9]*' | sed 's/Sequence: //')
    CC_SEQUENCE=$((COMMITTED_SEQUENCE + 1))
    infoln "Chaincode already committed, incrementing sequence to ${CC_SEQUENCE}"
  else
    infoln "Chaincode not yet committed, using sequence ${CC_SEQUENCE}"
  fi
  
  if [ "$CC_INIT_FCN" = "NA" ]; then
    INIT_REQUIRED=""
  else
    INIT_REQUIRED="--init-required"
  fi
}
