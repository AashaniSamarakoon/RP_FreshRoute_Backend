#!/usr/bin/env bash
#
# SPDX-License-Identifier: Apache-2.0
#
# FreshRoute Network Restore Utility
# Production-grade restore from backup

source scripts/utils.sh

BACKUP_FILE=$1

if [ -z "$BACKUP_FILE" ]; then
  fatalln "Usage: ./scripts/restore.sh <backup-file.tar.gz>"
fi

if [ ! -f "$BACKUP_FILE" ]; then
  fatalln "Backup file not found: $BACKUP_FILE"
fi

infoln "Starting FreshRoute Network Restore"
infoln "Backup file: $BACKUP_FILE"

# Ask for confirmation
warnln "⚠️  WARNING: This will overwrite existing network data!"
read -p "Are you sure you want to continue? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
  infoln "Restore cancelled"
  exit 0
fi

# Stop network if running
infoln "Stopping network..."
./network.sh down

# Create temporary directory
TEMP_DIR=$(mktemp -d)
infoln "Extracting backup to $TEMP_DIR..."

tar xzf "$BACKUP_FILE" -C "$TEMP_DIR"

# Find the backup directory
BACKUP_DIR=$(ls -d $TEMP_DIR/freshroute_backup_* 2>/dev/null | head -1)

if [ -z "$BACKUP_DIR" ]; then
  fatalln "Invalid backup file structure"
fi

# Display backup metadata
if [ -f "$BACKUP_DIR/backup_metadata.json" ]; then
  infoln "Backup Information:"
  cat "$BACKUP_DIR/backup_metadata.json"
  echo ""
fi

# Restore crypto material
if [ -d "$BACKUP_DIR/crypto/organizations" ]; then
  infoln "Restoring crypto material..."
  rm -rf ./organizations
  cp -r "$BACKUP_DIR/crypto/organizations" ./
  successln "Crypto material restored"
fi

# Restore channel artifacts
if [ -d "$BACKUP_DIR/channel-artifacts" ]; then
  infoln "Restoring channel artifacts..."
  rm -rf ./channel-artifacts
  cp -r "$BACKUP_DIR/channel-artifacts" ./
  successln "Channel artifacts restored"
fi

if [ -d "$BACKUP_DIR/system-genesis-block" ]; then
  rm -rf ./system-genesis-block
  cp -r "$BACKUP_DIR/system-genesis-block" ./
  successln "Genesis block restored"
fi

# Restore configuration files
if [ -d "$BACKUP_DIR/config" ]; then
  infoln "Restoring configuration files..."
  [ -f "$BACKUP_DIR/config/configtx.yaml" ] && cp "$BACKUP_DIR/config/configtx.yaml" ./configtx/
  [ -f "$BACKUP_DIR/config/docker-compose-freshroute.yaml" ] && cp "$BACKUP_DIR/config/docker-compose-freshroute.yaml" ./compose/docker/
  [ -d "$BACKUP_DIR/config/cryptogen" ] && cp -r "$BACKUP_DIR/config/cryptogen" ./organizations/
  successln "Configuration files restored"
fi

# Start network
infoln "Starting network..."
./network.sh up

# Wait for network to be ready
sleep 10

# Restore ledger data
if [ -d "$BACKUP_DIR/ledger" ]; then
  infoln "Restoring ledger data..."
  
  # Stop containers to restore volumes
  docker compose -f compose/docker/docker-compose-freshroute.yaml stop
  
  # Restore peer ledgers
  for ledger_file in $BACKUP_DIR/ledger/*_ledger.tar.gz; do
    if [ -f "$ledger_file" ]; then
      peer_name=$(basename $ledger_file | sed 's/_ledger.tar.gz//')
      infoln "Restoring $peer_name ledger..."
      
      docker run --rm \
        -v docker_${peer_name}.freshroute.com:/peer-data \
        -v "$BACKUP_DIR/ledger":/backup \
        busybox sh -c "rm -rf /peer-data/* && tar xzf /backup/${peer_name}_ledger.tar.gz -C /peer-data"
      
      if [ $? -eq 0 ]; then
        successln "$peer_name ledger restored"
      else
        warnln "Failed to restore $peer_name ledger"
      fi
    fi
  done
  
  # Restart containers
  docker compose -f compose/docker/docker-compose-freshroute.yaml start
  sleep 5
fi

# Restore CouchDB data
if [ -d "$BACKUP_DIR/couchdb" ]; then
  infoln "Restoring CouchDB data..."
  
  for db_file in $BACKUP_DIR/couchdb/*.json; do
    if [ -f "$db_file" ]; then
      filename=$(basename $db_file)
      db_name=$(echo $filename | cut -d'_' -f1-2)
      database=$(echo $filename | sed "s/${db_name}_//" | sed 's/.json$//')
      
      if docker ps | grep -q "$db_name"; then
        infoln "Restoring $db_name/$database..."
        
        # Create database
        docker exec $db_name curl -X PUT "http://localhost:5984/$database" 2>/dev/null
        
        # Restore documents
        jq -c '.rows[]' "$db_file" 2>/dev/null | while read doc; do
          docker exec $db_name curl -X POST "http://localhost:5984/$database" \
            -H "Content-Type: application/json" \
            -d "$doc" 2>/dev/null
        done
        
        successln "$db_name/$database restored"
      fi
    fi
  done
fi

# Cleanup
rm -rf "$TEMP_DIR"

successln "✓ Restore completed successfully!"
echo ""
infoln "Network Status:"
docker ps --format "table {{.Names}}\t{{.Status}}" | grep freshroute

echo ""
infoln "Run health check: ./scripts/healthcheck.sh"
