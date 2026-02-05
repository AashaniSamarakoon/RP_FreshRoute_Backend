# FreshRoute Network Operations Runbook

## Quick Start Commands

```bash
# Start the network
./network.sh up

# Create channel
./network.sh createChannel -c freshroute-channel

# Deploy chaincode
./network.sh deployCCAAS -ccn freshroute -ccp ../asset-transfer-basic/chaincode-typescript/

# Health check
./scripts/healthcheck.sh

# Backup
./scripts/backup.sh

# Stop network
./network.sh down
```

## Daily Operations

### Morning Health Check

```bash
cd freshroute-network
./scripts/healthcheck.sh

# Check disk space
df -h

# Check container logs
docker logs peer0.farmer.freshroute.com --tail 50
docker logs orderer.freshroute.com --tail 50
```

### Monitoring Dashboard Access

- **Prometheus**: http://localhost:9090
- **Grafana**: http://localhost:3001 (admin/freshroute123)
- **API Gateway**: http://localhost:3000/health

## Common Issues & Solutions

### Issue 1: Containers Exited Unexpectedly

**Symptoms**: `docker ps` shows containers with status "Exited"

**Solution**:

```bash
# Check logs
docker logs <container-name> --tail 100

# Restart specific container
docker start <container-name>

# Full network restart
./network.sh down
./network.sh up
./network.sh createChannel -c freshroute-channel
```

### Issue 2: Channel Not Found

**Symptoms**: "Error: channel not found" when invoking chaincode

**Solution**:

```bash
# Recreate channel
./network.sh createChannel -c freshroute-channel

# Verify channel exists
docker exec peer0.farmer.freshroute.com peer channel list
```

### Issue 3: Chaincode Invocation Timeout

**Symptoms**: Transaction timeout errors

**Solution**:

```bash
# Check chaincode containers
docker ps | grep ccaas

# Restart chaincode containers
docker restart peer0farmer_freshroute_ccaas
docker restart peer0buyer_freshroute_ccaas
docker restart peer0transporter_freshroute_ccaas

# Check peer logs
docker logs peer0.farmer.freshroute.com | grep chaincode
```

### Issue 4: Disk Space Full

**Symptoms**: "No space left on device"

**Solution**:

```bash
# Clean up old Docker resources
docker system prune -a --volumes

# Remove old backups (keep last 7)
cd backups
ls -t *.tar.gz | tail -n +8 | xargs rm

# Check space again
df -h
```

## Backup & Restore Procedures

### Daily Backup (Automated)

```bash
# Manual trigger
./scripts/backup.sh

# Schedule with cron (add to crontab)
0 2 * * * cd /path/to/freshroute-network && ./scripts/backup.sh
```

### Restore from Backup

```bash
# Stop network first
./network.sh down

# Restore
./scripts/restore.sh backups/freshroute_backup_TIMESTAMP.tar.gz

# Verify
./scripts/healthcheck.sh
```

## Monitoring

### Start Monitoring Stack

```bash
cd monitoring
docker compose -f docker-compose-monitoring.yaml up -d
```

### Key Metrics to Watch

1. **Block Height**: Should continuously increase
2. **Transaction Throughput**: Monitor via Grafana
3. **Resource Usage**: CPU < 80%, Memory < 85%, Disk < 90%
4. **Container Health**: All containers "healthy" or "running"

## Security Operations

### Certificate Renewal (Future with Fabric CA)

```bash
# Currently using cryptogen - certificates don't expire
# TODO: Implement Fabric CA for certificate lifecycle
```

### Access Control Review

```bash
# List all identities
ls organizations/peerOrganizations/*/users/

# Review admin access logs
docker logs peer0.farmer.freshroute.com | grep "Admin"
```

## Upgrading Chaincode

```bash
# Stop old chaincode containers
docker stop peer0farmer_freshroute_ccaas peer0buyer_freshroute_ccaas peer0transporter_freshroute_ccaas

# Deploy new version
./network.sh deployCCAAS -ccn freshroute -ccp <new-chaincode-path> -ccv 2.0 -ccs 2

# Verify
docker ps | grep ccaas
```

## Scaling Operations

### Adding a New Organization

1. Create crypto material:

```bash
cryptogen generate --config=organizations/cryptogen/crypto-config-neworg.yaml
```

2. Update configtx.yaml with new org definition
3. Update channel configuration
4. Join new peers to channel

### Adding Peers to Existing Org

1. Generate peer crypto
2. Add peer definition to docker-compose
3. Start new peer
4. Join peer to channel

## Incident Response

### Severity 1: Network Down

1. Check all container status: `docker ps -a`
2. Review logs: `./scripts/healthcheck.sh`
3. Attempt graceful restart: `./network.sh down && ./network.sh up`
4. If unsuccessful, restore from backup
5. Notify stakeholders

### Severity 2: Performance Degradation

1. Check resource usage: `docker stats`
2. Review Grafana dashboards
3. Check for long-running queries
4. Consider scaling if persistent

### Severity 3: Single Component Failure

1. Restart failed component
2. Monitor recovery
3. Document in incident log

## Performance Tuning

### Optimizing Throughput

```bash
# Adjust block timeout in configtx.yaml
BatchTimeout: 500ms

# Increase batch size
MaxMessageCount: 500
```

### CouchDB Optimization

```bash
# Compact databases
docker exec couchdb0.farmer curl -X POST http://admin:admin@localhost:5984/<dbname>/_compact
```

## Maintenance Windows

### Planned Maintenance Checklist

1. [ ] Notify users 48 hours in advance
2. [ ] Create backup before changes
3. [ ] Test changes in staging environment
4. [ ] Execute during low-traffic period
5. [ ] Monitor for 2 hours post-change
6. [ ] Document changes in changelog

## Emergency Contacts

- **Network Administrator**: [Your Contact]
- **Blockchain Team Lead**: [Your Contact]
- **24/7 On-Call**: [Your Contact]

## Useful Commands Reference

```bash
# View all containers
docker ps -a

# Follow logs in real-time
docker logs -f <container-name>

# Execute command in container
docker exec -it <container-name> bash

# Query chaincode
docker exec cli peer chaincode query -C freshroute-channel -n freshroute -c '{"Args":["GetAllAssets"]}'

# Invoke chaincode
docker exec cli peer chaincode invoke -C freshroute-channel -n freshroute -c '{"Args":["CreateAsset","asset1","blue","50","Tom","100"]}'

# Check channel height
docker exec peer0.farmer.freshroute.com peer channel getinfo -c freshroute-channel

# List installed chaincode
docker exec peer0.farmer.freshroute.com peer lifecycle chaincode queryinstalled
```

## Disaster Recovery

### RTO (Recovery Time Objective): 1 hour

### RPO (Recovery Point Objective): 24 hours

### Recovery Steps:

1. Restore from latest backup (15 mins)
2. Verify data integrity (15 mins)
3. Start all services (10 mins)
4. Run health checks (10 mins)
5. Resume operations (10 mins)
