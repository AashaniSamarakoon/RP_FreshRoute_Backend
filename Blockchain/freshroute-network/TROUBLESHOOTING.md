# FreshRoute Network - Troubleshooting Guide

Common issues and solutions for the FreshRoute production network.

## Table of Contents

1. [Network Startup Issues](#network-startup-issues)
2. [Channel Creation Issues](#channel-creation-issues)
3. [Chaincode Deployment Issues](#chaincode-deployment-issues)
4. [Runtime Issues](#runtime-issues)
5. [Performance Issues](#performance-issues)
6. [Docker Issues](#docker-issues)

---

## Network Startup Issues

### Issue: "Port already in use"

**Error:**

```
Error response from daemon: driver failed programming external connectivity:
Bind for 0.0.0.0:7051 failed: port is already allocated
```

**Solutions:**

1. **Check what's using the port:**

```bash
# Windows
netstat -ano | findstr :7051

# Linux/Mac
lsof -i :7051
```

2. **Stop conflicting containers:**

```bash
docker ps
docker stop <container-id>

# Or stop all Fabric containers
docker stop $(docker ps -aq --filter label=service=hyperledger-fabric)
```

3. **Stop test-network if running:**

```bash
cd ../test-network
./network.sh down
```

---

### Issue: "cryptogen: command not found"

**Error:**

```
./network.sh: line 95: cryptogen: command not found
```

**Solutions:**

1. **Check if binaries exist:**

```bash
ls ../bin/
```

2. **Add to PATH:**

```bash
export PATH=${PWD}/../bin:$PATH
```

3. **Install Fabric binaries if missing:**

```bash
curl -sSL https://bit.ly/2ysbOFE | bash -s -- 2.5.9 1.5.12
```

---

### Issue: "Docker daemon not running"

**Error:**

```
Cannot connect to the Docker daemon at unix:///var/run/docker.sock
```

**Solutions:**

1. **Start Docker:**
   - Windows: Start Docker Desktop
   - Linux: `sudo systemctl start docker`
   - Mac: Start Docker Desktop

2. **Verify Docker is running:**

```bash
docker ps
```

---

### Issue: "Permission denied" on scripts

**Error:**

```
bash: ./network.sh: Permission denied
```

**Solution:**

```bash
chmod +x network.sh
chmod +x scripts/*.sh
chmod +x organizations/ccp-generate.sh
```

---

## Channel Creation Issues

### Issue: "Channel already exists"

**Error:**

```
Error: failed to create channel: rpc error: code = Unknown desc = channel already exists
```

**Solution:**

```bash
# Remove existing channel artifacts
rm -rf channel-artifacts/*.block
rm -rf channel-artifacts/*.tx

# Restart network
./network.sh down
./network.sh up
./network.sh createChannel -c freshroute-channel
```

---

### Issue: "Failed to join channel"

**Error:**

```
Error: proposal failed with status: 500
```

**Solutions:**

1. **Check peer logs:**

```bash
docker logs peer0.farmer.freshroute.com
```

2. **Verify channel block exists:**

```bash
ls -lh channel-artifacts/freshroute-channel.block
```

3. **Verify peer is running:**

```bash
docker ps | grep peer0.farmer
```

4. **Try joining again:**

```bash
./network.sh createChannel -c freshroute-channel
```

---

### Issue: "Orderer connection failed"

**Error:**

```
Error: failed to send transaction: calling ordering service failed: connection refused
```

**Solutions:**

1. **Check orderer status:**

```bash
docker ps | grep orderer
docker logs orderer.freshroute.com
```

2. **Verify orderer endpoints:**

```bash
grep -r "orderer.freshroute.com:7050" configtx/
```

3. **Restart orderers:**

```bash
docker restart orderer.freshroute.com orderer2.freshroute.com orderer3.freshroute.com
```

---

## Chaincode Deployment Issues

### Issue: "Dockerfile not found"

**Error:**

```
Error: unable to read Dockerfile at ../asset-transfer-basic/chaincode-typescript/Dockerfile
```

**Solutions:**

1. **Verify path:**

```bash
ls ../asset-transfer-basic/chaincode-typescript/Dockerfile
```

2. **Check current directory:**

```bash
pwd
# Should be: .../Blockchain/freshroute-network
```

3. **Use absolute path:**

```bash
./network.sh deployCCAAS -ccn freshroute -ccp "$(pwd)/../asset-transfer-basic/chaincode-typescript/"
```

---

### Issue: "Docker build failed"

**Error:**

```
Error response from daemon: dockerfile parse error
```

**Solutions:**

1. **Check Dockerfile syntax:**

```bash
cat ../asset-transfer-basic/chaincode-typescript/Dockerfile
```

2. **Build manually to see full error:**

```bash
cd ../asset-transfer-basic/chaincode-typescript/
docker build -t test .
```

3. **Check Docker has enough resources:**
   - Increase Docker memory to 8GB+
   - Increase disk space

---

### Issue: "Chaincode install failed"

**Error:**

```
Error: chaincode install failed with status: 500
```

**Solutions:**

1. **Check package exists:**

```bash
ls -lh freshroute.tar.gz
```

2. **Verify peer connection:**

```bash
export CORE_PEER_ADDRESS=localhost:7051
peer version
```

3. **Check peer logs:**

```bash
docker logs peer0.farmer.freshroute.com 2>&1 | tail -50
```

4. **Try repackaging:**

```bash
rm freshroute.tar.gz
./network.sh deployCCAAS -ccn freshroute -ccp ../asset-transfer-basic/chaincode-typescript/
```

---

### Issue: "Chaincode approval failed"

**Error:**

```
Error: proposal failed with status: 500 - failed to invoke backing implementation
```

**Solutions:**

1. **Check all peers approved:**

```bash
peer lifecycle chaincode checkcommitreadiness --channelID freshroute-channel --name freshroute --version 1.0 --sequence 1
```

2. **Verify endorsement policy:**

```bash
# Should show all 3 orgs approved
```

3. **Re-approve for each org:**

```bash
# Run deployCCAAS again
./network.sh deployCCAAS -ccn freshroute -ccp ../asset-transfer-basic/chaincode-typescript/
```

---

### Issue: "Chaincode container not starting"

**Error:**

```
Error: container peer0farmer_freshroute_ccaas is not running
```

**Solutions:**

1. **Check container logs:**

```bash
docker logs peer0farmer_freshroute_ccaas
```

2. **Verify network:**

```bash
docker network ls | grep freshroute
```

3. **Check PACKAGE_ID:**

```bash
peer lifecycle chaincode queryinstalled
```

4. **Manually start container:**

```bash
docker start peer0farmer_freshroute_ccaas
```

---

## Runtime Issues

### Issue: "Transaction invoke failed"

**Error:**

```
Error: endorsement failure during invoke: chaincode response 500
```

**Solutions:**

1. **Check chaincode logs:**

```bash
docker logs peer0farmer_freshroute_ccaas
```

2. **Verify function name:**

```bash
# Check your chaincode for correct function names
```

3. **Test with simple query:**

```bash
peer chaincode query -C freshroute-channel -n freshroute \
  -c '{"Args":["org.hyperledger.fabric:GetMetadata"]}'
```

4. **Check endorsement policy:**

```bash
peer lifecycle chaincode querycommitted --channelID freshroute-channel --name freshroute
```

---

### Issue: "Access denied" errors

**Error:**

```
Error: access denied for client identity
```

**Solutions:**

1. **Verify MSP ID:**

```bash
echo $CORE_PEER_LOCALMSPID
# Should be: FarmerOrgMSP, BuyerOrgMSP, or TransporterOrgMSP
```

2. **Check identity:**

```bash
echo $CORE_PEER_MSPCONFIGPATH
# Should point to correct admin MSP
```

3. **Re-export environment:**

```bash
export CORE_PEER_LOCALMSPID="FarmerOrgMSP"
export CORE_PEER_MSPCONFIGPATH=${PWD}/organizations/peerOrganizations/farmer.freshroute.com/users/Admin@farmer.freshroute.com/msp
```

---

### Issue: "CouchDB connection failed"

**Error:**

```
Error: Failed to connect to CouchDB
```

**Solutions:**

1. **Check CouchDB container:**

```bash
docker ps | grep couchdb
docker logs couchdb0.farmer
```

2. **Test CouchDB access:**

```bash
curl http://admin:adminpw@localhost:5984/_all_dbs
```

3. **Restart CouchDB:**

```bash
docker restart couchdb0.farmer
```

4. **Verify peer env vars:**

```bash
docker exec peer0.farmer.freshroute.com env | grep COUCH
```

---

## Performance Issues

### Issue: "Slow transaction processing"

**Solutions:**

1. **Check container resources:**

```bash
docker stats
```

2. **Increase Docker resources:**
   - Memory: 8GB minimum
   - CPUs: 4+ cores
   - Disk: 50GB+

3. **Check CouchDB indexing:**
   - Create indexes for frequent queries
   - Monitor CouchDB performance

4. **Review chaincode:**
   - Optimize complex queries
   - Reduce state reads/writes
   - Use batch operations

---

### Issue: "High memory usage"

**Solutions:**

1. **Check which containers using memory:**

```bash
docker stats --no-stream
```

2. **Limit container resources:**
   - Edit docker-compose file
   - Add memory limits

3. **Increase system swap:**

```bash
# Linux
sudo swapon --show
```

4. **Clean up unused Docker resources:**

```bash
docker system prune -a
docker volume prune
```

---

## Docker Issues

### Issue: "No space left on device"

**Solutions:**

1. **Check disk space:**

```bash
df -h
docker system df
```

2. **Clean up Docker:**

```bash
docker system prune -a --volumes
```

3. **Remove old images:**

```bash
docker images
docker rmi <image-id>
```

---

### Issue: "Network fabric_freshroute not found"

**Solutions:**

1. **List networks:**

```bash
docker network ls
```

2. **Recreate network:**

```bash
docker network create fabric_freshroute
```

3. **Restart Docker Compose:**

```bash
./network.sh down
./network.sh up
```

---

### Issue: "Container keeps restarting"

**Solutions:**

1. **Check container logs:**

```bash
docker logs <container-name>
```

2. **Check exit code:**

```bash
docker inspect <container-name> | grep ExitCode
```

3. **Run container interactively:**

```bash
docker run -it <image-name> /bin/bash
```

---

## Common Commands for Debugging

### View all logs

```bash
# All containers
docker-compose -f compose/docker/docker-compose-freshroute.yaml logs

# Specific container
docker logs -f peer0.farmer.freshroute.com

# Follow logs from all peers
docker logs -f peer0.farmer.freshroute.com &
docker logs -f peer0.buyer.freshroute.com &
docker logs -f peer0.transporter.freshroute.com &
```

### Check container health

```bash
docker ps -a
docker inspect peer0.farmer.freshroute.com
docker stats --no-stream
```

### Network diagnostics

```bash
docker network inspect fabric_freshroute
docker exec peer0.farmer.freshroute.com ping peer0.buyer.freshroute.com
```

### Chaincode debugging

```bash
# List installed chaincodes
peer lifecycle chaincode queryinstalled

# Query committed chaincodes
peer lifecycle chaincode querycommitted --channelID freshroute-channel

# Check chaincode logs
docker logs peer0farmer_freshroute_ccaas
```

---

## Getting Help

If you can't resolve an issue:

1. **Collect logs:**

```bash
./network.sh down
rm -rf log.txt
./network.sh up 2>&1 | tee log.txt
```

2. **Check prerequisites:**
   - Docker version
   - Fabric binaries version
   - Available disk space
   - Available memory

3. **Review documentation:**
   - README.md
   - QUICKSTART.md
   - MIGRATION.md
   - Hyperledger Fabric docs

4. **Common fixes:**

```bash
# Nuclear option - complete reset
./network.sh down
docker system prune -a --volumes
./network.sh up
```

---

## Prevention Tips

1. **Always check logs** when things fail
2. **Verify prerequisites** before starting
3. **Keep backups** of working configurations
4. **Test changes incrementally**
5. **Monitor resource usage**
6. **Keep Docker updated**
7. **Follow the QUICKSTART** guide exactly first time

---

**Still having issues?** Check the logs and error messages carefully - they usually point to the root cause!
