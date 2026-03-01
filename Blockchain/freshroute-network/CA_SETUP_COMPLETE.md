# FreshRoute CA Setup Complete ✅

## Certificate Authority Deployment

All Fabric Certificate Authorities have been successfully deployed and configured for the FreshRoute network.

### CA Containers Running

| Organization | Container Name                | Port  | Operations Port | Status     |
| ------------ | ----------------------------- | ----- | --------------- | ---------- |
| Farmer       | ca.farmer.freshroute.com      | 7054  | 17054           | ✅ Running |
| Buyer        | ca.buyer.freshroute.com       | 8054  | 18054           | ✅ Running |
| Transporter  | ca.transporter.freshroute.com | 9054  | 19054           | ✅ Running |
| Orderer      | ca.orderer.freshroute.com     | 10054 | 20054           | ✅ Running |

### Admin Enrollment Successful

All admin identities have been enrolled and saved to the wallet:

✅ `admin.FarmerOrgMSP.id`  
✅ `admin.BuyerOrgMSP.id`  
✅ `admin.TransporterOrgMSP.id`

## CA Architecture

### Certificate Management Flow

```
┌─────────────────────────────────────────────────────────┐
│           Fabric Certificate Authorities                │
└─────────────────────────────────────────────────────────┘
                          │
          ┌───────────────┼───────────────┬──────────────┐
          │               │               │              │
    ┌─────▼─────┐  ┌─────▼─────┐  ┌─────▼─────┐  ┌─────▼─────┐
    │  Farmer   │  │   Buyer   │  │Transporter│  │  Orderer  │
    │    CA     │  │    CA     │  │    CA     │  │    CA     │
    │  :7054    │  │  :8054    │  │  :9054    │  │  :10054   │
    └─────┬─────┘  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘
          │               │               │              │
     ┌────▼────┐     ┌────▼────┐     ┌────▼────┐    ┌────▼────┐
     │ Admins  │     │ Admins  │     │ Admins  │    │ Orderer │
     │  Users  │     │  Users  │     │  Users  │    │  Nodes  │
     │  Peers  │     │  Peers  │     │  Peers  │    │  Admins │
     └─────────┘     └─────────┘     └─────────┘    └─────────┘
```

### CA Credentials

All CAs use the default bootstrap identity:

- **Username**: admin
- **Password**: adminpw

**⚠️ Security Note**: Change these credentials for production deployments!

## User Enrollment with Role Attributes

The CAs are configured to issue certificates with role attributes for ABAC (Attribute-Based Access Control):

### Enrollment Examples

**Farmer User:**

```bash
fabric-ca-client register --caname ca-farmer \
  --id.name farmer1 \
  --id.secret farmer1pw \
  --id.type client \
  --id.attrs 'role=farmer:ecert' \
  --tls.certfiles organizations/fabric-ca/farmer/ca-cert.pem
```

**Buyer User:**

```bash
fabric-ca-client register --caname ca-buyer \
  --id.name buyer1 \
  --id.secret buyer1pw \
  --id.type client \
  --id.attrs 'role=buyer:ecert' \
  --tls.certfiles organizations/fabric-ca/buyer/ca-cert.pem
```

**Transporter User:**

```bash
fabric-ca-client register --caname ca-transporter \
  --id.name transporter1 \
  --id.secret transporter1pw \
  --id.type client \
  --id.attrs 'role=transporter:ecert' \
  --tls.certfiles organizations/fabric-ca/transporter/ca-cert.pem
```

## Backend Integration

The Backend services are configured to use CAs for identity management:

### enrollAdmin.js

Enrolls admin users for each organization:

```javascript
// Configuration
const caInfos = [
  {
    caURL: "https://localhost:7054",
    caName: "ca-farmer",
    mspId: "FarmerOrgMSP",
  },
  {
    caURL: "https://localhost:8054",
    caName: "ca-buyer",
    mspId: "BuyerOrgMSP",
  },
  {
    caURL: "https://localhost:9054",
    caName: "ca-transporter",
    mspId: "TransporterOrgMSP",
  },
];
```

**Usage:**

```bash
cd Backend
node Services/blockchain/enrollAdmin.js
```

### identityService.js

Registers and enrolls users with role attributes:

```javascript
// Register user with role
await ca.register(
  {
    enrollmentID: userId,
    enrollmentSecret: password,
    role: "client",
    attrs: [
      {
        name: "role",
        value: role, // 'farmer', 'buyer', or 'transporter'
        ecert: true,
      },
    ],
  },
  adminUser,
);
```

**Usage:**

```javascript
const identityService = require("./Services/blockchain/identityService");

// Register a new farmer
await identityService.registerUser("farmer1", "farmer1pw", "farmer");

// Register a new buyer
await identityService.registerUser("buyer1", "buyer1pw", "buyer");
```

## File Structure

```
freshroute-network/
├── compose/docker/
│   ├── docker-compose-ca.yaml          # CA containers definition
│   └── docker-compose-freshroute.yaml  # Network containers (orderer3 now on :7056)
│
├── organizations/
│   └── fabric-ca/
│       ├── farmer/                     # Farmer CA data
│       ├── buyer/                      # Buyer CA data
│       ├── transporter/                # Transporter CA data
│       ├── ordererOrg/                 # Orderer CA data
│       └── registerEnroll-freshroute.sh # Enrollment automation script
│
Backend/
└── wallet/
    ├── admin.FarmerOrgMSP.id           # Enrolled admin identities
    ├── admin.BuyerOrgMSP.id
    └── admin.TransporterOrgMSP.id
```

## Managing CAs

### Start CAs

```bash
cd freshroute-network
docker compose -f compose/docker/docker-compose-ca.yaml up -d
```

### Stop CAs

```bash
cd freshroute-network
docker compose -f compose/docker/docker-compose-ca.yaml down
```

### View CA Logs

```bash
# All CAs
docker compose -f compose/docker/docker-compose-ca.yaml logs -f

# Specific CA
docker logs -f ca.farmer.freshroute.com
```

### Check CA Health

```bash
# Farmer CA
curl -k https://localhost:17054/healthz

# Buyer CA
curl -k https://localhost:18054/healthz

# Transporter CA
curl -k https://localhost:19054/healthz

# Orderer CA
curl -k https://localhost:20054/healthz
```

## Certificate Lifecycle Management

### Benefits of Fabric CA

✅ **Dynamic Certificate Issuance**: Issue certificates on-demand without restarting network  
✅ **Certificate Renewal**: Renew certificates before expiration  
✅ **Certificate Revocation**: Revoke compromised certificates via CRL  
✅ **Attribute-Based Access Control**: Issue certificates with custom attributes  
✅ **Enrollment Tracking**: Audit trail of all identity enrollments  
✅ **Production Ready**: Proper PKI infrastructure for cloud deployment

### Comparison with Cryptogen

| Feature                   | Fabric CA | Cryptogen        |
| ------------------------- | --------- | ---------------- |
| Dynamic User Registration | ✅ Yes    | ❌ No            |
| Certificate Renewal       | ✅ Yes    | ❌ No            |
| Certificate Revocation    | ✅ Yes    | ❌ No            |
| Role Attributes           | ✅ Yes    | ❌ No            |
| Production Suitable       | ✅ Yes    | ❌ No (dev only) |
| Setup Complexity          | Medium    | Low              |

## Port Conflict Resolution

**Issue**: Orderer3 was using port 7054, conflicting with Farmer CA.

**Solution**: Changed orderer3 from port 7054 to 7056:

```yaml
# docker-compose-freshroute.yaml
orderer3.freshroute.com:
  environment:
    - ORDERER_GENERAL_LISTENPORT=7056
  ports:
    - 7056:7056
```

## Troubleshooting

### CA Not Starting

**Check port availability:**

```bash
netstat -ano | findstr "7054"  # Windows
lsof -i :7054                  # Linux/Mac
```

**View CA startup logs:**

```bash
docker logs ca.farmer.freshroute.com
```

### Enrollment Fails

**Verify CA is running:**

```bash
docker ps | grep ca.
```

**Check CA certificate exists:**

```bash
ls organizations/fabric-ca/farmer/ca-cert.pem
```

**Test CA connectivity:**

```bash
curl -k https://localhost:7054/cainfo
```

### User Registration Fails

**Verify admin is enrolled:**

```bash
ls Backend/wallet/admin.*.id
```

**Check CA logs for errors:**

```bash
docker logs -f ca.farmer.freshroute.com
```

## Next Steps

### 1. Register Application Users

Use `identityService.js` to register farmers, buyers, and transporters:

```javascript
// In your application code
const { registerUser } = require("./Services/blockchain/identityService");

// Register new users
await registerUser("farmer123", "securePassword", "farmer");
await registerUser("buyer456", "securePassword", "buyer");
await registerUser("transporter789", "securePassword", "transporter");
```

### 2. Implement Certificate Renewal

Set up automated certificate renewal before expiration (default: 1 year).

### 3. Configure Certificate Revocation

Implement CRL (Certificate Revocation List) checking in production.

### 4. Secure CA Admin Credentials

Change default `admin:adminpw` and store securely (e.g., HashiCorp Vault, AWS Secrets Manager).

### 5. Enable CA TLS

Configure mutual TLS for CA communication in production environments.

### 6. Backup CA Data

Regularly backup CA database and private keys:

```bash
cd freshroute-network
./scripts/backup.sh
```

## Security Best Practices

1. **Change Default Passwords**: Update CA admin password from `adminpw`
2. **Enable HSM**: Use Hardware Security Module for CA private keys in production
3. **Implement Mutual TLS**: Require client certificates for CA connections
4. **Monitor Certificate Expiration**: Set up alerts for expiring certificates
5. **Regular Backups**: Backup CA data and certificates daily
6. **Access Control**: Restrict CA operations ports (17054, 18054, 19054, 20054)
7. **Audit Logs**: Enable and monitor CA audit logging
8. **Secure Storage**: Encrypt CA database and certificate storage

## Production Deployment

For cloud deployment (AWS/Azure/GCP/DigitalOcean):

1. **Deploy CAs in separate containers/VMs** for high availability
2. **Use managed databases** for CA persistence (RDS, Azure SQL, Cloud SQL)
3. **Enable TLS** with valid certificates (Let's Encrypt, corporate CA)
4. **Configure firewalls** to restrict CA port access
5. **Implement backup/restore** automation
6. **Set up monitoring** with Prometheus/Grafana
7. **Enable audit logging** to SIEM systems

---

**Status**: ✅ **CA Setup Complete**  
**Last Updated**: February 6, 2026  
**Maintainer**: FreshRoute Development Team

**Quick Test:**

```bash
# Verify all CAs are running
docker ps | grep ca.

# Test admin enrollment
cd Backend
node Services/blockchain/enrollAdmin.js

# Expected output:
# Successfully enrolled admin for FarmerOrgMSP and saved as admin.FarmerOrgMSP.id
# Successfully enrolled admin for BuyerOrgMSP and saved as admin.BuyerOrgMSP.id
# Successfully enrolled admin for TransporterOrgMSP and saved as admin.TransporterOrgMSP.id
```

🎉 **Congratulations!** Your FreshRoute network now has production-grade certificate management!
