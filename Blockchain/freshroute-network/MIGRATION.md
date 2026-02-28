# Migration Guide: Test Network → FreshRoute Network

This guide helps you migrate from the test-network to the production FreshRoute network.

## Overview

The FreshRoute network is a production-ready alternative to test-network with:

- Custom organization names (FarmerOrg, BuyerOrg, TransporterOrg)
- Enhanced security (TLS enabled)
- High availability (2 peers per org, 3 orderers)
- Production-grade configuration

## Pre-Migration Checklist

- [ ] Test network is working correctly
- [ ] All chaincodes are deployed and tested
- [ ] Backend application is tested with test-network
- [ ] CouchDB data is backed up (if needed)
- [ ] Docker has sufficient resources (8GB+ RAM recommended)

## Migration Steps

### 1. Backup Current State (Optional)

If you want to preserve test-network data:

```bash
cd Blockchain/test-network

# Export current data from CouchDB
curl http://admin:adminpw@localhost:5984/_all_dbs
# Backup specific databases as needed

# Keep test-network running for now
```

### 2. Update Backend Configuration

Update your Backend connection to use FreshRoute network:

**Before (test-network):**

```javascript
// Backend connection profile
const ccpPath = path.resolve(__dirname, "test-network", "organizations", "peerOrganizations", "org1.example.com", "connection-org1.json");
```

**After (freshroute-network):**

```javascript
// Backend connection profile
const ccpPath = path.resolve(__dirname, "freshroute-network", "organizations", "peerOrganizations", "farmer.freshroute.com", "connection-farmer.json");
```

### 3. Update Environment Variables

**Backend/.env**

Update these if you have network-specific configs:

```env
# Before
CHANNEL_NAME=mychannel
CHAINCODE_NAME=basic

# After
CHANNEL_NAME=freshroute-channel
CHAINCODE_NAME=freshroute
```

### 4. Update Organization References

Search and replace in your Backend code:

| Old (test-network) | New (FreshRoute)           |
| ------------------ | -------------------------- |
| Org1MSP            | FarmerOrgMSP               |
| Org2MSP            | BuyerOrgMSP                |
| Org3MSP            | TransporterOrgMSP          |
| org1.example.com   | farmer.freshroute.com      |
| org2.example.com   | buyer.freshroute.com       |
| org3.example.com   | transporter.freshroute.com |
| mychannel          | freshroute-channel         |
| peer0.org1         | peer0.farmer               |
| peer0.org2         | peer0.buyer                |

### 5. Update Port References (if hardcoded)

| Component    | Test Network | FreshRoute Network        |
| ------------ | ------------ | ------------------------- |
| peer0.org1   | 7051         | 7051 (peer0.farmer)       |
| peer0.org2   | 9051         | 9051 (peer0.buyer)        |
| peer0.org3   | 11051        | 11051 (peer0.transporter) |
| CouchDB org1 | 5984         | 5984 (farmer)             |
| CouchDB org2 | 7984         | 7984 (buyer)              |
| CouchDB org3 | 9984         | 9984 (transporter)        |

**Note:** Main ports remain the same for easier migration!

### 6. Deploy FreshRoute Network

```bash
# Stop test network
cd Blockchain/test-network
./network.sh down

# Start FreshRoute network
cd ../freshroute-network
./network.sh up
./network.sh createChannel -c freshroute-channel
./network.sh deployCCAAS -ccn freshroute -ccp ../asset-transfer-basic/chaincode-typescript/ -ccl typescript
```

### 7. Verify Network is Running

```bash
# Check all containers
docker ps

# Should see:
# - 3 orderers (orderer, orderer2, orderer3)
# - 6 peers (2 per org)
# - 6 CouchDB instances
# - 3 chaincode containers (ccaas)
# - 1 CLI container

# Test CouchDB access
curl http://admin:adminpw@localhost:5984/_all_dbs
curl http://admin:adminpw@localhost:7984/_all_dbs
curl http://admin:adminpw@localhost:9984/_all_dbs
```

### 8. Re-initialize Data

Since you're starting with a fresh ledger:

```bash
# Set environment for peer operations
export PATH=${PWD}/../bin:$PATH
export FABRIC_CFG_PATH=${PWD}/../config/
export CORE_PEER_TLS_ENABLED=true
export CORE_PEER_LOCALMSPID="FarmerOrgMSP"
export CORE_PEER_TLS_ROOTCERT_FILE=${PWD}/organizations/peerOrganizations/farmer.freshroute.com/tlsca/tlsca.farmer.freshroute.com-cert.pem
export CORE_PEER_MSPCONFIGPATH=${PWD}/organizations/peerOrganizations/farmer.freshroute.com/users/Admin@farmer.freshroute.com/msp
export CORE_PEER_ADDRESS=localhost:7051
export ORDERER_CA=${PWD}/organizations/ordererOrganizations/freshroute.com/tlsca/tlsca.freshroute.com-cert.pem

# Initialize your chaincode (if you have InitLedger function)
peer chaincode invoke -o localhost:7050 \
  --ordererTLSHostnameOverride orderer.freshroute.com \
  --tls --cafile $ORDERER_CA \
  -C freshroute-channel -n freshroute \
  --peerAddresses localhost:7051 --tlsRootCertFiles ${PWD}/organizations/peerOrganizations/farmer.freshroute.com/tlsca/tlsca.farmer.freshroute.com-cert.pem \
  -c '{"function":"InitLedger","Args":[]}'
```

### 9. Test Backend Application

```bash
cd Backend
npm run dev

# Test API endpoints:
# - Create harvest
# - Query harvests
# - Create orders
# - etc.
```

### 10. Verify Data in CouchDB

Open browsers to verify data is being written:

- http://localhost:5984/\_utils (Farmer)
- http://localhost:7984/\_utils (Buyer)
- http://localhost:9984/\_utils (Transporter)

Login: admin/adminpw

Check for your channel databases (e.g., `freshroute-channel_freshroute`)

## Code Migration Examples

### Gateway Connection

**Before:**

```typescript
const gateway = new Gateway();
await gateway.connect(ccpPath, {
  wallet,
  identity: "admin",
  discovery: { enabled: true, asLocalhost: true },
});

const network = await gateway.getNetwork("mychannel");
const contract = network.getContract("basic");
```

**After:**

```typescript
const gateway = new Gateway();
await gateway.connect(ccpPath, {
  wallet,
  identity: "admin",
  discovery: { enabled: true, asLocalhost: true },
});

const network = await gateway.getNetwork("freshroute-channel");
const contract = network.getContract("freshroute");
```

### Identity/Wallet Management

**Before:**

```typescript
const wallet = await Wallets.newFileSystemWallet(walletPath);
const identity = await wallet.get("Org1MSPadmin");
```

**After:**

```typescript
const wallet = await Wallets.newFileSystemWallet(walletPath);
const identity = await wallet.get("FarmerOrgMSPadmin");
```

### User Enrollment

**Before:**

```typescript
const ca = new FabricCAServices("https://localhost:7054", { trustedRoots: caPEM, verify: false }, "ca-org1");
```

**After:**

```typescript
const ca = new FabricCAServices("https://localhost:7054", { trustedRoots: caPEM, verify: false }, "ca-farmer");
```

## Rollback Plan

If you need to rollback to test-network:

```bash
# Stop FreshRoute network
cd Blockchain/freshroute-network
./network.sh down

# Start test network
cd ../test-network
./network.sh up createChannel -c mychannel -s couchdb
./network.sh deployCCAAS -ccn basic -ccp ../asset-transfer-basic/chaincode-typescript/ -ccl typescript

# Revert Backend code changes
git checkout Backend/
```

## Testing Checklist

After migration, verify:

- [ ] Network starts successfully
- [ ] All 15+ containers are running
- [ ] Channel created successfully
- [ ] Chaincode deployed successfully
- [ ] Backend can connect to network
- [ ] Can create transactions (harvests, orders, etc.)
- [ ] Data appears in CouchDB
- [ ] All API endpoints work
- [ ] Chaincode queries work
- [ ] Chaincode invokes work
- [ ] Multiple organizations can transact

## Performance Comparison

| Metric            | Test Network  | FreshRoute Network |
| ----------------- | ------------- | ------------------ |
| Peers             | 3 (1 per org) | 6 (2 per org)      |
| Orderers          | 1-3           | 3 (Raft)           |
| Fault Tolerance   | Low           | High               |
| CouchDB Instances | 3             | 6                  |
| TLS               | Optional      | Enabled            |
| Production Ready  | No            | Yes                |

## Common Issues

### Issue: Cannot connect to peer

**Solution:** Verify peer is running and port is correct

```bash
docker ps | grep peer0.farmer
netstat -an | grep 7051
```

### Issue: Identity not found

**Solution:** Re-enroll users with new org names

```bash
# Use the new org MSP IDs in your enrollment code
```

### Issue: Chaincode not found

**Solution:** Redeploy chaincode

```bash
./network.sh deployCCAAS -ccn freshroute -ccp ../asset-transfer-basic/chaincode-typescript/
```

### Issue: Channel not found

**Solution:** Recreate channel

```bash
./network.sh createChannel -c freshroute-channel
```

## Production Recommendations

Now that you're on FreshRoute network:

1. **Monitor Resources**: Set up Prometheus/Grafana
2. **Backup Strategy**: Regular CouchDB backups
3. **Logging**: Centralized log aggregation
4. **Security**: Review TLS certificates before deployment
5. **Performance**: Load test your network
6. **High Availability**: Consider multi-host deployment
7. **Disaster Recovery**: Document recovery procedures

## Support

If you encounter issues during migration:

1. Check logs: `docker logs <container-name>`
2. Compare configurations between networks
3. Verify all environment variables are updated
4. Test each component individually
5. Review this guide step-by-step

## Next Steps

- [ ] Complete migration
- [ ] Run full test suite
- [ ] Performance testing
- [ ] Security audit
- [ ] Documentation update
- [ ] Team training on new network

---

**Migration complete?** Your FreshRoute network is now ready for production! 🎉
