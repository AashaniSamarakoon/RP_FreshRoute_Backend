#!/usr/bin/env bash
#
# SPDX-License-Identifier: Apache-2.0
#
# FreshRoute Network Health Check Script
# Production-grade monitoring for all network components

source scripts/utils.sh

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

ORDERERS=("orderer.freshroute.com" "orderer2.freshroute.com" "orderer3.freshroute.com")
PEERS=("peer0.farmer.freshroute.com" "peer1.farmer.freshroute.com" 
       "peer0.buyer.freshroute.com" "peer1.buyer.freshroute.com"
       "peer0.transporter.freshroute.com" "peer1.transporter.freshroute.com")
COUCHDB=("couchdb0.farmer" "couchdb1.farmer" "couchdb0.buyer" "couchdb1.buyer" "couchdb0.transporter" "couchdb1.transporter")

HEALTHY=0
UNHEALTHY=0
WARNING=0

print_header() {
  echo ""
  echo "=================================="
  echo "  FreshRoute Network Health Check"
  echo "  $(date)"
  echo "=================================="
  echo ""
}

check_container() {
  local container=$1
  local status=$(docker inspect -f '{{.State.Status}}' $container 2>/dev/null)
  local health=$(docker inspect -f '{{.State.Health.Status}}' $container 2>/dev/null)
  
  if [ "$status" = "running" ]; then
    if [ "$health" = "healthy" ] || [ "$health" = "" ]; then
      echo -e "${GREEN}✓${NC} $container: Running"
      ((HEALTHY++))
      return 0
    else
      echo -e "${YELLOW}⚠${NC} $container: Running but unhealthy ($health)"
      ((WARNING++))
      return 1
    fi
  else
    echo -e "${RED}✗${NC} $container: $status"
    ((UNHEALTHY++))
    return 2
  fi
}

check_orderers() {
  echo "Orderer Nodes:"
  echo "-------------"
  for orderer in "${ORDERERS[@]}"; do
    check_container $orderer
  done
  echo ""
}

check_peers() {
  echo "Peer Nodes:"
  echo "----------"
  for peer in "${PEERS[@]}"; do
    check_container $peer
  done
  echo ""
}

check_couchdb() {
  echo "CouchDB Instances:"
  echo "-----------------"
  for db in "${COUCHDB[@]}"; do
    check_container $db
  done
  echo ""
}

check_channel_height() {
  echo "Channel Block Height:"
  echo "--------------------"
  
  . scripts/envVar.sh
  setGlobals farmer
  
  local height=$(peer channel getinfo -c freshroute-channel 2>/dev/null | grep "Blockchain info:" -A 10 | grep "height" | awk '{print $2}')
  
  if [ ! -z "$height" ]; then
    echo -e "${GREEN}✓${NC} freshroute-channel: Block height = $height"
    ((HEALTHY++))
  else
    echo -e "${RED}✗${NC} freshroute-channel: Cannot retrieve block height"
    ((UNHEALTHY++))
  fi
  echo ""
}

check_chaincode() {
  echo "Chaincode Status:"
  echo "----------------"
  
  . scripts/envVar.sh
  setGlobals farmer
  
  local cc_info=$(peer lifecycle chaincode querycommitted -C freshroute-channel 2>/dev/null | grep "Sequence")
  
  if [ ! -z "$cc_info" ]; then
    echo -e "${GREEN}✓${NC} Chaincode committed on freshroute-channel"
    echo "  $cc_info"
    ((HEALTHY++))
  else
    echo -e "${YELLOW}⚠${NC} No chaincode committed on freshroute-channel"
    ((WARNING++))
  fi
  echo ""
}

check_disk_space() {
  echo "Disk Space:"
  echo "----------"
  local usage=$(df -h | grep -E '^/dev/' | awk '{print $5}' | sed 's/%//' | sort -n | tail -1)
  
  if [ $usage -lt 80 ]; then
    echo -e "${GREEN}✓${NC} Disk usage: ${usage}% (healthy)"
    ((HEALTHY++))
  elif [ $usage -lt 90 ]; then
    echo -e "${YELLOW}⚠${NC} Disk usage: ${usage}% (warning)"
    ((WARNING++))
  else
    echo -e "${RED}✗${NC} Disk usage: ${usage}% (critical)"
    ((UNHEALTHY++))
  fi
  echo ""
}

check_memory() {
  echo "Memory Usage:"
  echo "------------"
  local total=$(free -m | awk 'NR==2{print $2}')
  local used=$(free -m | awk 'NR==2{print $3}')
  local percent=$((used * 100 / total))
  
  if [ $percent -lt 80 ]; then
    echo -e "${GREEN}✓${NC} Memory: ${used}MB / ${total}MB (${percent}%)"
    ((HEALTHY++))
  elif [ $percent -lt 90 ]; then
    echo -e "${YELLOW}⚠${NC} Memory: ${used}MB / ${total}MB (${percent}%)"
    ((WARNING++))
  else
    echo -e "${RED}✗${NC} Memory: ${used}MB / ${total}MB (${percent}%)"
    ((UNHEALTHY++))
  fi
  echo ""
}

print_summary() {
  echo "=================================="
  echo "Summary:"
  echo -e "  ${GREEN}Healthy:${NC} $HEALTHY"
  echo -e "  ${YELLOW}Warnings:${NC} $WARNING"
  echo -e "  ${RED}Unhealthy:${NC} $UNHEALTHY"
  echo "=================================="
  echo ""
  
  if [ $UNHEALTHY -gt 0 ]; then
    echo -e "${RED}Status: CRITICAL - Immediate attention required${NC}"
    return 2
  elif [ $WARNING -gt 0 ]; then
    echo -e "${YELLOW}Status: WARNING - Investigation recommended${NC}"
    return 1
  else
    echo -e "${GREEN}Status: HEALTHY - All systems operational${NC}"
    return 0
  fi
}

# Main execution
print_header
check_orderers
check_peers
check_couchdb
check_channel_height
check_chaincode
check_disk_space
check_memory
print_summary

exit $?
