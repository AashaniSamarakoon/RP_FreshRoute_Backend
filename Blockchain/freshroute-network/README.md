# FreshRoute Production Network

This is a production-ready Hyperledger Fabric network for FreshRoute with three organizations:

- **FarmerOrg** - Manages farmer operations and harvest assets
- **BuyerOrg** - Manages buyer operations and purchase orders
- **TransporterOrg** - Manages logistics and transportation

## Network Architecture

### Organizations

- **3 Peer Organizations**: FarmerOrg, BuyerOrg, TransporterOrg
- **2 Peers per Organization** (total 6 peers)
- **3 Orderers** (Raft consensus)
- **CouchDB** state database for each peer (6 CouchDB instances)
- **TLS enabled** for secure communication

### Ports

| Component                   | Port  |
| --------------------------- | ----- |
| peer0.farmer                | 7051  |
| peer1.farmer                | 8051  |
| peer0.buyer                 | 9051  |
| peer1.buyer                 | 10051 |
| peer0.transporter           | 11051 |
| peer1.transporter           | 12051 |
| orderer                     | 7050  |
| orderer2                    | 7052  |
| orderer3                    | 7054  |
| CouchDB (farmer-peer0)      | 5984  |
| CouchDB (farmer-peer1)      | 6984  |
| CouchDB (buyer-peer0)       | 7984  |
| CouchDB (buyer-peer1)       | 8984  |
| CouchDB (transporter-peer0) | 9984  |
| CouchDB (transporter-peer1) | 10984 |

## Prerequisites

- Docker and Docker Compose
- Hyperledger Fabric binaries (v2.5.9)
- jq (for JSON processing)
- bash/sh shell

## Quick Start

### 1. Start the Network

```bash
cd freshroute-network
./network.sh up
```

This will:

- Generate crypto material for all organizations
- Create genesis block
- Start all containers (peers, orderers, CouchDB)

### 2. Create Channel

```bash
./network.sh createChannel -c freshroute-channel
```

This will:

- Create the channel genesis block
- Join all orderers to the channel
- Join all peer organizations to the channel
- Set anchor peers for each organization

### 3. Deploy Chaincode (CCAAS)

```bash
./network.sh deployCCAAS -ccn freshroute -ccp ../asset-transfer-basic/chaincode-typescript/ -ccl typescript
```

This will:

- Build the chaincode Docker image
- Package the chaincode
- Install chaincode on all peers
- Approve chaincode for all organizations
- Commit chaincode definition
- Start chaincode containers

### 4. Stop the Network

```bash
./network.sh down
```

This will stop all containers and remove volumes (ledger data will be lost).

## Advanced Usage

### Custom Channel Name

```bash
./network.sh createChannel -c my-custom-channel
```

### Deploy Different Chaincode

```bash
./network.sh deployCCAAS -ccn mycc -ccp /path/to/chaincode -ccl typescript -ccv 2.0
```

### Restart Network (Keep Data)

```bash
./network.sh restart
```

## Network Components

### Crypto Material

All cryptographic material is generated using `cryptogen` and stored in:

- `organizations/peerOrganizations/`
- `organizations/ordererOrganizations/`

### Channel Artifacts

Channel configuration and blocks are stored in:

- `channel-artifacts/`

### Connection Profiles

Connection profiles for client applications are generated at:

- `organizations/peerOrganizations/farmer.freshroute.com/connection-farmer.json`
- `organizations/peerOrganizations/buyer.freshroute.com/connection-buyer.json`
- `organizations/peerOrganizations/transporter.freshroute.com/connection-transporter.json`

## Accessing CouchDB

CouchDB Fauxton UI is accessible at:

- Farmer Peer0: http://localhost:5984/\_utils (admin/adminpw)
- Farmer Peer1: http://localhost:6984/\_utils (admin/adminpw)
- Buyer Peer0: http://localhost:7984/\_utils (admin/adminpw)
- Buyer Peer1: http://localhost:8984/\_utils (admin/adminpw)
- Transporter Peer0: http://localhost:9984/\_utils (admin/adminpw)
- Transporter Peer1: http://localhost:10984/\_utils (admin/adminpw)

## Chaincode Deployment

The network supports Chaincode-as-a-Service (CCAAS) deployment pattern, where:

1. Chaincode runs in its own Docker container
2. Each peer has a dedicated chaincode container
3. Chaincode communicates with peers via gRPC

### CCAAS Containers

After deploying chaincode named "freshroute":

- `peer0farmer_freshroute_ccaas`
- `peer0buyer_freshroute_ccaas`
- `peer0transporter_freshroute_ccaas`

## Monitoring

View container logs:

```bash
docker logs -f peer0.farmer.freshroute.com
docker logs -f orderer.freshroute.com
docker logs -f peer0farmer_freshroute_ccaas
```

View all running containers:

```bash
docker ps
```

## Troubleshooting

### Network won't start

- Ensure no other Fabric networks are running
- Check Docker has sufficient resources
- Verify all required ports are available

### Channel creation fails

- Ensure network is up and running
- Check orderer logs for errors
- Verify crypto material was generated correctly

### Chaincode deployment fails

- Check chaincode path is correct
- Ensure Dockerfile exists in chaincode directory
- Verify chaincode builds successfully
- Check peer logs for detailed errors

## Production Considerations

For production deployment:

1. **Use Fabric CA** instead of cryptogen for dynamic certificate management
2. **Enable mutual TLS** for client authentication
3. **Configure resource limits** for containers
4. **Set up monitoring** (Prometheus, Grafana)
5. **Implement backup strategy** for ledger data
6. **Use external ordering service** for better fault tolerance
7. **Deploy across multiple hosts** for high availability
8. **Secure CouchDB** with proper credentials and network isolation
9. **Configure firewall rules** and network policies
10. **Implement proper key management** and HSM integration

## Network Topology

```
FreshRoute Network
│
├── Orderer Cluster (Raft)
│   ├── orderer.freshroute.com:7050
│   ├── orderer2.freshroute.com:7052
│   └── orderer3.freshroute.com:7054
│
├── FarmerOrg (FarmerOrgMSP)
│   ├── peer0.farmer.freshroute.com:7051
│   │   └── couchdb0.farmer:5984
│   └── peer1.farmer.freshroute.com:8051
│       └── couchdb1.farmer:6984
│
├── BuyerOrg (BuyerOrgMSP)
│   ├── peer0.buyer.freshroute.com:9051
│   │   └── couchdb0.buyer:7984
│   └── peer1.buyer.freshroute.com:10051
│       └── couchdb1.buyer:8984
│
└── TransporterOrg (TransporterOrgMSP)
    ├── peer0.transporter.freshroute.com:11051
    │   └── couchdb0.transporter:9984
    └── peer1.transporter.freshroute.com:12051
        └── couchdb1.transporter:10984
```

## Files and Directories

```
freshroute-network/
├── network.sh                  # Main network management script
├── README.md                   # This file
├── configtx/
│   └── configtx.yaml          # Network topology configuration
├── organizations/
│   ├── cryptogen/             # Crypto config files
│   ├── ccp-generate.sh        # Connection profile generator
│   ├── ccp-template.json      # Connection profile template (JSON)
│   └── ccp-template.yaml      # Connection profile template (YAML)
├── compose/
│   └── docker/
│       └── docker-compose-freshroute.yaml  # Docker compose file
└── scripts/
    ├── utils.sh               # Utility functions
    ├── envVar.sh              # Environment variables
    ├── createChannel.sh       # Channel creation script
    ├── setAnchorPeer.sh       # Anchor peer configuration
    ├── configUpdate.sh        # Config update utilities
    ├── deployCCAAS.sh         # CCAAS deployment script
    └── ccutils.sh             # Chaincode utility functions
```

## Support

For issues or questions:

1. Check the logs: `docker logs <container-name>`
2. Review Hyperledger Fabric documentation
3. Ensure all prerequisites are met
4. Verify network configuration matches your environment

## License

SPDX-License-Identifier: Apache-2.0
