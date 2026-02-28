#!/usr/bin/env bash
#
# SPDX-License-Identifier: Apache-2.0
#
# FreshRoute Network Backup Utility
# Production-grade backup for certificates, ledger data, and configurations

source scripts/utils.sh

BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_PATH="$BACKUP_DIR/freshroute_backup_$TIMESTAMP"

# Ensure backup directory exists
mkdir -p "$BACKUP_PATH"

infoln "Starting FreshRoute Network Backup"
infoln "Backup location: $BACKUP_PATH"

# Function to backup crypto material
backup_crypto() {
  infoln "Backing up crypto material..."
  mkdir -p "$BACKUP_PATH/crypto"
  
  if [ -d "./organizations" ]; then
    cp -r ./organizations "$BACKUP_PATH/crypto/"
    successln "Crypto material backed up"
  else
    warnln "No crypto material found"
  fi
}

# Function to backup channel artifacts
backup_channel_artifacts() {
  infoln "Backing up channel artifacts..."
  mkdir -p "$BACKUP_PATH/channel-artifacts"
  
  if [ -d "./channel-artifacts" ]; then
    cp -r ./channel-artifacts "$BACKUP_PATH/"
    successln "Channel artifacts backed up"
  else
    warnln "No channel artifacts found"
  fi
  
  if [ -d "./system-genesis-block" ]; then
    cp -r ./system-genesis-block "$BACKUP_PATH/"
    successln "Genesis block backed up"
  fi
}

# Function to backup configuration files
backup_config() {
  infoln "Backing up configuration files..."
  mkdir -p "$BACKUP_PATH/config"
  
  # Backup key configuration files
  [ -f "./configtx/configtx.yaml" ] && cp ./configtx/configtx.yaml "$BACKUP_PATH/config/"
  [ -f "./compose/docker/docker-compose-freshroute.yaml" ] && cp ./compose/docker/docker-compose-freshroute.yaml "$BACKUP_PATH/config/"
  [ -d "./organizations/cryptogen" ] && cp -r ./organizations/cryptogen "$BACKUP_PATH/config/"
  
  successln "Configuration files backed up"
}

# Function to backup ledger data from Docker volumes
backup_ledger_data() {
  infoln "Backing up ledger data from Docker volumes..."
  mkdir -p "$BACKUP_PATH/ledger"
  
  # Check if containers are running
  if ! docker ps | grep -q "peer0.farmer.freshroute.com"; then
    warnln "Network is not running. Skipping ledger backup."
    return
  fi
  
  # Backup peer ledger data
  for peer in peer0.farmer peer0.buyer peer0.transporter peer1.farmer peer1.buyer peer1.transporter; do
    if docker ps | grep -q "$peer.freshroute.com"; then
      infoln "Backing up $peer ledger..."
      docker run --rm \
        -v docker_${peer}.freshroute.com:/peer-data:ro \
        -v "$PWD/$BACKUP_PATH/ledger":/backup \
        busybox tar czf /backup/${peer}_ledger.tar.gz -C /peer-data . 2>/dev/null
      
      if [ $? -eq 0 ]; then
        successln "$peer ledger backed up"
      else
        warnln "Failed to backup $peer ledger"
      fi
    fi
  done
  
  # Backup orderer ledger data
  for orderer in orderer orderer2 orderer3; do
    if docker ps | grep -q "$orderer.freshroute.com"; then
      infoln "Backing up $orderer ledger..."
      docker run --rm \
        -v docker_${orderer}.freshroute.com:/orderer-data:ro \
        -v "$PWD/$BACKUP_PATH/ledger":/backup \
        busybox tar czf /backup/${orderer}_ledger.tar.gz -C /orderer-data . 2>/dev/null
      
      if [ $? -eq 0 ]; then
        successln "$orderer ledger backed up"
      else
        warnln "Failed to backup $orderer ledger"
      fi
    fi
  done
}

# Function to backup CouchDB data
backup_couchdb() {
  infoln "Backing up CouchDB data..."
  mkdir -p "$BACKUP_PATH/couchdb"
  
  for db in couchdb0.farmer couchdb0.buyer couchdb0.transporter \
            couchdb1.farmer couchdb1.buyer couchdb1.transporter; do
    if docker ps | grep -q "$db"; then
      infoln "Backing up $db..."
      
      # Get all databases
      databases=$(docker exec $db curl -s http://localhost:5984/_all_dbs 2>/dev/null | jq -r '.[]' | grep -v "^_")
      
      for database in $databases; do
        docker exec $db curl -s "http://localhost:5984/$database/_all_docs?include_docs=true" > "$BACKUP_PATH/couchdb/${db}_${database}.json" 2>/dev/null
      done
      
      successln "$db backed up"
    fi
  done
}

# Function to create metadata file
create_metadata() {
  infoln "Creating backup metadata..."
  
  cat > "$BACKUP_PATH/backup_metadata.json" <<EOF
{
  "backup_timestamp": "$TIMESTAMP",
  "backup_date": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "network_name": "freshroute-network",
  "channel_name": "freshroute-channel",
  "fabric_version": "2.5.9",
  "backup_type": "full",
  "components": {
    "crypto_material": true,
    "channel_artifacts": true,
    "configuration": true,
    "ledger_data": true,
    "couchdb_data": true
  }
}
EOF
  
  successln "Metadata created"
}

# Function to compress backup
compress_backup() {
  infoln "Compressing backup..."
  
  cd "$BACKUP_DIR"
  tar czf "freshroute_backup_$TIMESTAMP.tar.gz" "freshroute_backup_$TIMESTAMP"
  
  if [ $? -eq 0 ]; then
    rm -rf "freshroute_backup_$TIMESTAMP"
    successln "Backup compressed: freshroute_backup_$TIMESTAMP.tar.gz"
    successln "Backup size: $(du -h freshroute_backup_$TIMESTAMP.tar.gz | awk '{print $1}')"
  else
    fatalln "Failed to compress backup"
  fi
  
  cd - > /dev/null
}

# Main backup execution
backup_crypto
backup_channel_artifacts
backup_config
backup_ledger_data
backup_couchdb
create_metadata
compress_backup

successln "✓ Backup completed successfully!"
successln "Backup location: $BACKUP_DIR/freshroute_backup_$TIMESTAMP.tar.gz"

# Cleanup old backups (keep last 7)
infoln "Cleaning up old backups (keeping last 7)..."
cd "$BACKUP_DIR"
ls -t freshroute_backup_*.tar.gz | tail -n +8 | xargs -r rm
cd - > /dev/null

echo ""
infoln "To restore this backup, run:"
infoln "  ./scripts/restore.sh $BACKUP_DIR/freshroute_backup_$TIMESTAMP.tar.gz"
echo ""
