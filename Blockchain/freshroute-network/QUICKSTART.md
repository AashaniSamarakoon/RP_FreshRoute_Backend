# FreshRoute Network - Quick Start Guide

This guide will help you set up and run the FreshRoute production network in minutes.

## Prerequisites Check

Before starting, ensure you have:

1. **Docker & Docker Compose**

   ```bash
   docker --version
   docker compose version
   ```

2. **Hyperledger Fabric Binaries** (in `../bin/`)

   ```bash
   ls ../bin/
   # Should show: peer, orderer, cryptogen, configtxgen, etc.
   ```

3. **jq** (JSON processor)
   ```bash
   jq --version
   ```

## Step-by-Step Setup

### 1. Navigate to Network Directory

```bash
cd Blockchain/freshroute-network
```

### 2. Make Scripts Executable (Linux/Mac)

```bash
chmod +x network.sh
chmod +x organizations/ccp-generate.sh
chmod +x scripts/*.sh
```

For Windows, run in Git Bash or WSL.

### 3. Start the Network

```bash
./network.sh up
```

**What happens:**

- Generates crypto material for FarmerOrg, BuyerOrg, TransporterOrg
- Creates orderer genesis block
- Starts 3 orderers, 6 peers, 6 CouchDB instances

**Expected output:**

```
✅ FarmerOrg Identities created
✅ BuyerOrg Identities created
✅ TransporterOrg Identities created
✅ Orderer Org Identities created
✅ Network started
```

**Verify:**

```bash
docker ps
# Should see 15+ containers running
```

### 4. Create Channel

```bash
./network.sh createChannel -c freshroute-channel
```

**What happens:**

- Creates channel genesis block
- Joins 3 orderers to channel
- Joins all 3 org peers to channel
- Sets anchor peers

**Expected output:**

```
✅ Channel 'freshroute-channel' created
✅ Channel 'freshroute-channel' joined
```

### 5. Deploy Your Chaincode

For the StockContract chaincode:

```bash
./network.sh deployCCAAS -ccn freshroute -ccp ../asset-transfer-basic/chaincode-typescript/ -ccl typescript
```

**What happens:**

- Builds chaincode Docker image
- Packages chaincode
- Installs on all 3 org peers
- Approves for all orgs
- Commits chaincode definition
- Starts 3 chaincode containers

**Expected output:**

```
✅ Docker image built successfully
✅ Chaincode installed on all peers
✅ Chaincode definition committed
✅ Chaincode deployed successfully
```

**Verify deployment:**

```bash
docker ps | grep ccaas
# Should show 3 chaincode containers
```

### 6. Access CouchDB

Open in browser to see blockchain data:

- **Farmer Org**: http://localhost:5984/\_utils
- **Buyer Org**: http://localhost:7984/\_utils
- **Transporter Org**: http://localhost:9984/\_utils

Login: `admin` / `adminpw`

## Testing the Network

### Query Chaincode Metadata

```bash
export PATH=${PWD}/../bin:$PATH
export FABRIC_CFG_PATH=${PWD}/../config/

# Set env for farmer org
export CORE_PEER_TLS_ENABLED=true
export CORE_PEER_LOCALMSPID="FarmerOrgMSP"
export CORE_PEER_TLS_ROOTCERT_FILE=${PWD}/organizations/peerOrganizations/farmer.freshroute.com/tlsca/tlsca.farmer.freshroute.com-cert.pem
export CORE_PEER_MSPCONFIGPATH=${PWD}/organizations/peerOrganizations/farmer.freshroute.com/users/Admin@farmer.freshroute.com/msp
export CORE_PEER_ADDRESS=localhost:7051

# Query
peer chaincode query -C freshroute-channel -n freshroute -c '{"Args":["org.hyperledger.fabric:GetMetadata"]}'
```

### Invoke Chaincode (Create Harvest Example)

```bash
# This depends on your chaincode's InitLedger or similar function
peer chaincode invoke -o localhost:7050 \
  --ordererTLSHostnameOverride orderer.freshroute.com \
  --tls --cafile ${PWD}/organizations/ordererOrganizations/freshroute.com/tlsca/tlsca.freshroute.com-cert.pem \
  -C freshroute-channel -n freshroute \
  --peerAddresses localhost:7051 --tlsRootCertFiles ${PWD}/organizations/peerOrganizations/farmer.freshroute.com/tlsca/tlsca.farmer.freshroute.com-cert.pem \
  --peerAddresses localhost:9051 --tlsRootCertFiles ${PWD}/organizations/peerOrganizations/buyer.freshroute.com/tlsca/tlsca.buyer.freshroute.com-cert.pem \
  --peerAddresses localhost:11051 --tlsRootCertFiles ${PWD}/organizations/peerOrganizations/transporter.freshroute.com/tlsca/tlsca.transporter.freshroute.com-cert.pem \
  -c '{"function":"InitLedger","Args":[]}'
```

## Monitoring

### View Container Logs

```bash
# Peer logs
docker logs -f peer0.farmer.freshroute.com

# Orderer logs
docker logs -f orderer.freshroute.com

# Chaincode logs
docker logs -f peer0farmer_freshroute_ccaas
```

### View All Containers

```bash
docker ps -a
```

### Check Network Status

```bash
docker network ls | grep freshroute
```

## Stopping the Network

### Stop (keeps data)

```bash
docker compose -f compose/docker/docker-compose-freshroute.yaml stop
```

### Stop and remove everything

```bash
./network.sh down
```

**Warning:** This deletes all ledger data!

## Common Issues & Solutions

### Issue: "Port already in use"

**Solution:** Stop conflicting containers

```bash
docker ps
docker stop <conflicting-container>
```

### Issue: "Permission denied" on scripts

**Solution:** Make scripts executable

```bash
chmod +x network.sh scripts/*.sh organizations/*.sh
```

### Issue: Chaincode build fails

**Solution:** Check Dockerfile exists

```bash
ls ../asset-transfer-basic/chaincode-typescript/Dockerfile
```

### Issue: Channel creation fails

**Solution:** Ensure network is running

```bash
docker ps | grep orderer
docker ps | grep peer
```

### Issue: "cryptogen: command not found"

**Solution:** Install Fabric binaries or add to PATH

```bash
export PATH=${PWD}/../bin:$PATH
```

## Next Steps

1. **Connect Your Backend**
   - Use connection profiles in `organizations/peerOrganizations/*/connection-*.json`
   - Update your Backend application to use new network endpoints

2. **Test Your Application**
   - Run your Backend API
   - Test harvest creation, orders, etc.

3. **Monitor Performance**
   - Check CouchDB for data
   - Monitor container resources
   - Review logs for errors

4. **Plan Migration**
   - Test thoroughly before production
   - Plan data migration strategy
   - Set up proper monitoring and backups

## Differences from Test Network

| Feature       | Test Network     | FreshRoute Network                  |
| ------------- | ---------------- | ----------------------------------- |
| Organizations | Org1, Org2, Org3 | FarmerOrg, BuyerOrg, TransporterOrg |
| Domain        | example.com      | freshroute.com                      |
| Peers per org | 1                | 2 (for HA)                          |
| Orderers      | 1-3              | 3 (Raft)                            |
| Channel name  | mychannel        | freshroute-channel                  |
| Network name  | fabric_test      | fabric_freshroute                   |

## Resources

- Full README: `README.md`
- Fabric Docs: https://hyperledger-fabric.readthedocs.io/
- Docker Docs: https://docs.docker.com/

## Support

If you encounter issues:

1. Check logs: `docker logs <container-name>`
2. Verify prerequisites
3. Ensure ports are not in use
4. Review error messages carefully

---

**Ready to deploy?** Start with Step 1 above! 🚀
