# Blockchain Dashboard - Implementation Guide

## Quick Start

This guide explains how to use the new blockchain dashboard API extension.

---

## Prerequisites

1. **Existing Backend Running**
   - Node.js backend on port 4000
   - Supabase authentication configured
   - Hyperledger Fabric network running
   - User wallets registered

2. **User Roles Configured**
   - Users have roles: `farmer`, `buyer`, `transporter`, `admin`, `auditor`, or `developer`
   - Roles are stored in Supabase and included in JWT tokens

---

## Testing the API

### 1. Start the Backend

```bash
cd Backend
npm install
npm start
```

The server should start on port 4000 with the new dashboard routes registered.

### 2. Login and Get Token

```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "farmer@example.com",
    "password": "your-password"
  }'
```

Save the token from the response.

### 3. Test Dashboard Endpoints

**Get Dashboard Overview:**

```bash
curl http://localhost:4000/api/dashboard/overview \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Get Batch List:**

```bash
curl http://localhost:4000/api/dashboard/batch \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Get Batch Details (Business View):**

```bash
curl http://localhost:4000/api/dashboard/batch/BATCH001 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Get Batch Details (Technical View - Admin/Auditor only):**

```bash
curl http://localhost:4000/api/dashboard/batch/BATCH001?view=technical \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Get Batch Timeline:**

```bash
curl http://localhost:4000/api/dashboard/timeline/BATCH001 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Search Batches:**

```bash
curl "http://localhost:4000/api/dashboard/search?q=mango" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Get Trust Score:**

```bash
curl http://localhost:4000/api/dashboard/trust/BATCH001 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## Chaincode Requirements

The dashboard API expects the following chaincode functions to exist in your Hyperledger Fabric chaincode:

### Required Functions

1. **ReadBatch(batchId)** - Read a single batch
2. **GetAllBatches()** - Get all batches
3. **GetBatchHistory(batchId)** - Get batch transaction history
4. **GetBatchesByFarmer(farmerId)** - Get batches by farmer
5. **GetBatchesByBuyer(buyerId)** - Get batches by buyer (optional)
6. **GetBatchesByTransporter(transporterId)** - Get batches by transporter (optional)

### Expected Batch Data Structure

```json
{
  "batchId": "BATCH001",
  "docType": "batch",
  "productType": "Mango",
  "quantity": 500,
  "unit": "kg",
  "status": "CREATED",
  "farmerId": "farmer-123",
  "farmerName": "John Farmer",
  "farmLocation": "Dambulla Farm",
  "harvestedDate": "2023-12-25T08:00:00Z",
  "qualityGrade": "A",
  "qualityNotes": "Excellent quality",
  "currentOwner": "farmer-123",
  "buyerId": "",
  "buyerName": "",
  "transporterId": "",
  "transporterName": "",
  "createdBy": "farmer-123",
  "createdAt": "2023-12-25T08:00:00Z",
  "updatedBy": "farmer-123",
  "updatedAt": "2023-12-26T14:30:00Z"
}
```

### Batch History Format

The `GetBatchHistory` function should return:

```json
[
  {
    "txId": "abc123...",
    "timestamp": "2023-12-25T08:00:00Z",
    "isDelete": false,
    "value": "{\"batchId\":\"BATCH001\",\"status\":\"CREATED\",...}"
  },
  {
    "txId": "def456...",
    "timestamp": "2023-12-25T10:00:00Z",
    "isDelete": false,
    "value": "{\"batchId\":\"BATCH001\",\"status\":\"QUALITY_CHECKED\",...}"
  }
]
```

---

## Adding Chaincode Functions (if missing)

If your chaincode doesn't have these functions, add them:

### Example: GetBatchesByFarmer

```go
func (s *SmartContract) GetBatchesByFarmer(ctx contractapi.TransactionContextInterface, farmerId string) ([]*Batch, error) {
    queryString := fmt.Sprintf(`{"selector":{"docType":"batch","farmerId":"%s"}}`, farmerId)

    resultsIterator, err := ctx.GetStub().GetQueryResult(queryString)
    if err != nil {
        return nil, err
    }
    defer resultsIterator.Close()

    var batches []*Batch
    for resultsIterator.HasNext() {
        queryResponse, err := resultsIterator.Next()
        if err != nil {
            return nil, err
        }

        var batch Batch
        err = json.Unmarshal(queryResponse.Value, &batch)
        if err != nil {
            return nil, err
        }
        batches = append(batches, &batch)
    }

    return batches, nil
}
```

### Example: GetBatchHistory

```go
func (s *SmartContract) GetBatchHistory(ctx contractapi.TransactionContextInterface, batchId string) ([]HistoryQueryResult, error) {
    resultsIterator, err := ctx.GetStub().GetHistoryForKey(batchId)
    if err != nil {
        return nil, err
    }
    defer resultsIterator.Close()

    var history []HistoryQueryResult
    for resultsIterator.HasNext() {
        response, err := resultsIterator.Next()
        if err != nil {
            return nil, err
        }

        historyItem := HistoryQueryResult{
            TxId:      response.TxId,
            Timestamp: time.Unix(response.Timestamp.Seconds, int64(response.Timestamp.Nanos)).String(),
            IsDelete:  response.IsDelete,
            Value:     string(response.Value),
        }
        history = append(history, historyItem)
    }

    return history, nil
}
```

---

## Wallet Setup

Each user needs a wallet file in `Backend/wallet/`:

```
Backend/wallet/
├── farmer-123.id
├── buyer-456.id
├── transporter-789.id
└── admin.FarmerOrgMSP.id
```

### Wallet File Format

```json
{
  "credentials": {
    "certificate": "-----BEGIN CERTIFICATE-----\n...",
    "privateKey": "-----BEGIN PRIVATE KEY-----\n..."
  },
  "mspId": "FarmerOrgMSP",
  "type": "X.509"
}
```

### Generating Wallets

Use the existing `enrollAdmin.js` and `identityService.js` to generate wallets for users.

---

## Role Configuration

Ensure users have roles in Supabase:

```sql
-- Add role column if not exists
ALTER TABLE users ADD COLUMN role VARCHAR(50) DEFAULT 'farmer';

-- Update user roles
UPDATE users SET role = 'farmer' WHERE email = 'farmer@example.com';
UPDATE users SET role = 'buyer' WHERE email = 'buyer@example.com';
UPDATE users SET role = 'admin' WHERE email = 'admin@example.com';
```

The JWT token must include the role:

```javascript
// In auth.js
function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role, // ← Must include role
      name: user.name,
    },
    JWT_SECRET,
    { expiresIn: "7d" },
  );
}
```

---

## Frontend Integration

### Example: React Dashboard

```javascript
import axios from "axios";

const API_BASE = "http://localhost:4000/api/dashboard";

// Setup axios with auth token
const api = axios.create({
  baseURL: API_BASE,
  headers: {
    Authorization: `Bearer ${localStorage.getItem("token")}`,
  },
});

// Get dashboard overview
async function getDashboardOverview() {
  const response = await api.get("/overview");
  return response.data;
}

// Get batch list
async function getBatches(filters = {}) {
  const params = new URLSearchParams(filters);
  const response = await api.get(`/batch?${params}`);
  return response.data;
}

// Get batch timeline
async function getBatchTimeline(batchId) {
  const response = await api.get(`/timeline/${batchId}`);
  return response.data;
}

// Search batches
async function searchBatches(query) {
  const response = await api.get(`/search?q=${query}`);
  return response.data;
}

// Get trust score
async function getTrustScore(batchId) {
  const response = await api.get(`/trust/${batchId}`);
  return response.data;
}
```

### Example: Display Batch Timeline

```javascript
function BatchTimeline({ batchId }) {
  const [timeline, setTimeline] = useState(null);

  useEffect(() => {
    getBatchTimeline(batchId).then((data) => {
      setTimeline(data.data);
    });
  }, [batchId]);

  if (!timeline) return <div>Loading...</div>;

  return (
    <div>
      <h2>Timeline for {timeline.productType}</h2>
      <div className="milestones">
        {timeline.milestones.harvested && (
          <div className="milestone">
            ✅ Harvested - {timeline.milestones.harvested.date}
          </div>
        )}
        {timeline.milestones.packed && (
          <div className="milestone">
            ✅ Packed - {timeline.milestones.packed.date}
          </div>
        )}
        {timeline.milestones.inspected && (
          <div className="milestone">
            ✅ Inspected - {timeline.milestones.inspected.date}
          </div>
        )}
      </div>

      <div className="events">
        <h3>Full Event History</h3>
        {timeline.events.map((event) => (
          <div key={event.id} className="event">
            <div className="event-type">{event.type}</div>
            <div className="event-time">{event.dateTime}</div>
            <div className="event-description">{event.description}</div>
            {event.verified && <span className="verified">✔️ Verified</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## Troubleshooting

### Error: "Wallet for user not found"

**Solution:** Generate wallet for the user using `identityService.js`:

```bash
node Backend/Services/blockchain/enrollAdmin.js
```

### Error: "Failed to query batch"

**Solution:**

1. Ensure Fabric network is running
2. Check chaincode has required functions
3. Verify peer and orderer are accessible
4. Check wallet permissions

### Error: "Access denied"

**Solution:**

1. Check user role in JWT token
2. Verify role permissions in `roleMapper.js`
3. Ensure user owns the batch (for farmers/transporters)

### Error: "Missing token"

**Solution:**

1. Include `Authorization: Bearer <token>` header
2. Verify token is valid (not expired)
3. Check JWT_SECRET is configured

---

## Performance Tips

1. **Caching:** Consider caching batch lists in Redis or memory
2. **Pagination:** Add pagination for large batch lists
3. **Lazy Loading:** Load timeline events on demand
4. **Indexes:** Ensure CouchDB has proper indexes for queries
5. **Connection Pooling:** Reuse Fabric gateway connections where possible

---

## Security Checklist

- ✅ All endpoints require authentication
- ✅ Role-based access control enforced
- ✅ Technical view restricted to admin/auditor/developer
- ✅ Users can only access their own batches (unless admin)
- ✅ No blockchain internals exposed in business view
- ✅ Wallet files secured and not exposed via API
- ✅ JWT tokens have expiration (7 days)

---

## Next Steps

1. **Deploy to Production**
   - Configure Fabric Explorer URL
   - Set up proper TLS certificates
   - Configure production database

2. **Add Real-time Updates**
   - Implement WebSocket support
   - Listen to Fabric events
   - Push updates to connected clients

3. **Build Frontend Dashboard**
   - Create React/Vue dashboard
   - Implement batch explorer UI
   - Add timeline visualization
   - Create trust score widgets

4. **Extend Features**
   - Add batch analytics
   - Implement quality predictions
   - Create PDF reports
   - Add export functionality

---

## Support

For help with implementation:

1. Check logs in `Backend/` directory
2. Verify Fabric network status
3. Review chaincode logs
4. Test with Postman/curl first

---

## Additional Resources

- [Hyperledger Fabric Docs](https://hyperledger-fabric.readthedocs.io/)
- [Fabric Gateway SDK](https://hyperledger.github.io/fabric-gateway/)
- [FreshRoute Backend README](../README.md)
- [Blockchain Dashboard API Docs](./BLOCKCHAIN_DASHBOARD_API.md)
