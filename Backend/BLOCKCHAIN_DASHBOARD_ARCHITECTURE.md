# Blockchain Dashboard Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Frontend Clients                            │
│  (React Dashboard, React Native Apps, Mobile, Web)                  │
└────────────────────────┬────────────────────────────────────────────┘
                         │ HTTPS + JWT
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    FreshRoute Backend (Express.js)                   │
│                         PORT 4000                                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────────┐                    ┌────────────────────┐    │
│  │  Auth Middleware │────────────────────▶  Supabase Auth     │    │
│  │  (JWT Verify)    │                    │  (User Roles DB)   │    │
│  └────────┬─────────┘                    └────────────────────┘    │
│           │                                                          │
│           ▼                                                          │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │              Dashboard Routes (/api/dashboard)                │  │
│  │  ┌─────────────────────────────────────────────────────────┐ │  │
│  │  │ • /overview          → Overview & KPIs                  │ │  │
│  │  │ • /batch             → Batch Explorer                   │ │  │
│  │  │ • /timeline/:id      → Product Lifecycle                │ │  │
│  │  │ • /search            → Global Search                    │ │  │
│  │  │ • /trust/:id         → Trust Score                      │ │  │
│  │  │ • /verification/:id  → Verification Status              │ │  │
│  │  └─────────────────────────────────────────────────────────┘ │  │
│  └───────────────────────────┬──────────────────────────────────┘  │
│                              │                                      │
│                              ▼                                      │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │            Dashboard Controllers                             │  │
│  │  ┌──────────────────────────────────────────────────────┐   │  │
│  │  │ • batchController      → Batch operations            │   │  │
│  │  │ • timelineController   → Timeline generation         │   │  │
│  │  │ • searchController     → Search operations           │   │  │
│  │  │ • dashboardMetaController → KPIs, stats, config      │   │  │
│  │  └──────────────────────────────────────────────────────┘   │  │
│  └───────────────────────────┬──────────────────────────────────┘  │
│                              │                                      │
│                              ▼                                      │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │            Dashboard Services (Business Logic)               │  │
│  │  ┌──────────────────────────────────────────────────────┐   │  │
│  │  │ • batchService    → Batch DTOs, filtering            │   │  │
│  │  │ • timelineService → Event transformation             │   │  │
│  │  │ • trustService    → Trust score calculation          │   │  │
│  │  └──────────────────────────────────────────────────────┘   │  │
│  └───────────────────────────┬──────────────────────────────────┘  │
│                              │                                      │
│  ┌──────────────────┐        │        ┌──────────────────────┐    │
│  │   roleMapper     │◀───────┼───────▶│ blockchainLabelMapper│    │
│  │  (Permissions)   │        │        │  (Terminology)       │    │
│  └──────────────────┘        │        └──────────────────────┘    │
│                              ▼                                      │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │         Blockchain Service (Fabric Integration)              │  │
│  │  ┌──────────────────────────────────────────────────────┐   │  │
│  │  │ fabricQueryService (READ ONLY)                       │   │  │
│  │  │ • queryBatchById()                                   │   │  │
│  │  │ • queryAllBatches()                                  │   │  │
│  │  │ • queryBatchHistory()                                │   │  │
│  │  │ • searchBatches()                                    │   │  │
│  │  │ • getBatchVerificationStatus()                       │   │  │
│  │  │ • getBatchStatistics()                               │   │  │
│  │  └──────────────────────────────────────────────────────┘   │  │
│  │                              │                               │  │
│  │                              ▼                               │  │
│  │  ┌──────────────────────────────────────────────────────┐   │  │
│  │  │ contractService (EXISTING - Reused)                  │   │  │
│  │  │ • getContract(userId, contractName)                  │   │  │
│  │  │ • Fabric Gateway connection                          │   │  │
│  │  │ • Wallet management                                  │   │  │
│  │  └──────────────────────────────────────────────────────┘   │  │
│  └───────────────────────────┬──────────────────────────────────┘  │
│                              │                                      │
└──────────────────────────────┼──────────────────────────────────────┘
                               │ Fabric Gateway SDK
                               │ (gRPC + TLS)
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│              Hyperledger Fabric Network                              │
│                     (freshroute-channel)                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │
│  │   Peer 0     │  │   Peer 0     │  │   Peer 0     │             │
│  │ FarmerOrg    │  │  BuyerOrg    │  │ TransportOrg │             │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘             │
│         │                 │                 │                       │
│         └─────────────────┼─────────────────┘                       │
│                           │                                         │
│                    ┌──────▼───────┐                                 │
│                    │   Chaincode   │                                │
│                    │  (freshroute) │                                │
│                    │               │                                │
│                    │ ┌───────────┐ │                                │
│                    │ │ ReadBatch │ │                                │
│                    │ │GetAllBatch│ │                                │
│                    │ │GetHistory │ │                                │
│                    │ │ ...       │ │                                │
│                    │ └───────────┘ │                                │
│                    └───────────────┘                                │
│                           │                                         │
│                    ┌──────▼───────┐                                 │
│                    │   Orderer    │                                 │
│                    │ (Consensus)  │                                 │
│                    └──────────────┘                                 │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
                               │
                               │ (SEPARATE - NOT EMBEDDED)
                               ▼
                    ┌──────────────────────┐
                    │  Fabric Explorer     │
                    │  (Technical Tool)    │
                    │                      │
                    │  Only for:           │
                    │  • Auditors          │
                    │  • Developers        │
                    │  • Technical View    │
                    └──────────────────────┘
```

---

## Request Flow

### Business User Flow (Farmer viewing batches)

```
1. Frontend → POST /api/auth/login
   ↓
2. Backend → Verify credentials (Supabase)
   ↓
3. Backend → Generate JWT with role="farmer"
   ↓
4. Frontend ← JWT token
   ↓
5. Frontend → GET /api/dashboard/batch
              Authorization: Bearer <token>
   ↓
6. Backend → authMiddleware: Verify JWT
   ↓
7. Backend → batchController.getBatchList()
   ↓
8. Backend → batchService.getBatchList(userId, user)
   ↓
9. Backend → Check role: "farmer" → filter own batches only
   ↓
10. Backend → fabricQueryService.queryBatchesByOwner()
    ↓
11. Backend → contractService.getContract(userId, "FreshRouteContract")
    ↓
12. Backend → Fabric Gateway → Peer → Chaincode.GetBatchesByFarmer()
    ↓
13. Chaincode → Query ledger → Return batches
    ↓
14. Backend → Transform to Business DTO
             • CREATED → "Harvested"
             • Remove txId, blockNumber
             • Add verification indicators
    ↓
15. Frontend ← { success: true, data: [...batches], viewMode: "business" }
```

### Technical User Flow (Auditor viewing transaction details)

```
1. Frontend → GET /api/dashboard/batch/BATCH001?view=technical
              Authorization: Bearer <auditor-token>
   ↓
2. Backend → authMiddleware: Verify role="auditor"
   ↓
3. Backend → determineViewMode(): Check if auditor can view technical
             ✓ Allowed
   ↓
4. Backend → batchService.getBatchDetails(view="technical")
   ↓
5. Backend → fabricQueryService.queryBatchById()
             + fabricQueryService.queryBatchHistory()
   ↓
6. Fabric → Return batch + transaction history
   ↓
7. Backend → Transform to Technical DTO
             • Include txId, blockNumber
             • Add Fabric Explorer links
             • Include endorsement info
   ↓
8. Frontend ← {
                data: {
                  ...businessFields,
                  technical: {
                    txId: "abc123...",
                    blockNumber: 42,
                    explorerLink: "http://..."
                  }
                },
                viewMode: "technical"
              }
```

---

## Data Flow

### Business View Transformation

```
Fabric Ledger                   Backend Transform              Frontend Display
─────────────────────────────────────────────────────────────────────────────
{                               ┌──────────────┐              ┌─────────────┐
  batchId: "B001",              │ roleMapper   │              │  Batch Card │
  status: "CREATED",     ──────▶│ • Check role │──────▶       │             │
  txId: "abc123...",            │ • Filter     │              │  🌱 Mango   │
  blockNumber: 42,              └──────────────┘              │             │
  productType: "Mango",                                       │ Harvested   │
  farmerId: "F123",             ┌──────────────┐              │ 500 kg      │
  harvestedDate: "..."   ──────▶│ labelMapper  │──────▶       │             │
}                               │ • Translate  │              │ ✓ Verified  │
                                │ • Format     │              └─────────────┘
                                └──────────────┘
                                       │
                    Remove technical fields:
                    ❌ txId
                    ❌ blockNumber
                    ❌ channelId

                    Translate terms:
                    ✓ CREATED → "Harvested"
                    ✓ timestamp → "Dec 25 at 8:00 AM"
```

### Technical View (No Transformation)

```
Fabric Ledger                   Backend                       Frontend Display
─────────────────────────────────────────────────────────────────────────────
{                               ┌──────────────┐              ┌─────────────┐
  batchId: "B001",              │ roleMapper   │              │Technical View│
  status: "CREATED",     ──────▶│ • Check role │──────▶       │             │
  txId: "abc123...",            │   (admin?)   │              │ Batch: B001 │
  blockNumber: 42,              │ • Allow all  │              │ Status: CREATED
  productType: "Mango",         └──────────────┘              │             │
  farmerId: "F123",                                           │ TxID: abc...│
  harvestedDate: "..."          NO FILTERING                  │ Block: 42   │
}                               ALL FIELDS INCLUDED           │             │
                                                              │ [View in    │
                                + Add explorer link           │  Explorer]  │
                                                              └─────────────┘
```

---

## Component Responsibilities

### Controllers (HTTP Layer)

- ✓ Handle HTTP requests
- ✓ Validate input
- ✓ Call service layer
- ✓ Format HTTP response
- ✗ NO business logic
- ✗ NO direct Fabric calls

### Services (Business Logic)

- ✓ Business logic
- ✓ Data transformation
- ✓ Permission checking
- ✓ DTO creation
- ✗ NO HTTP handling
- ✗ NO direct database access

### Blockchain Services (Fabric Layer)

- ✓ Fabric SDK calls
- ✓ Query blockchain
- ✓ Handle Fabric errors
- ✗ NO business logic
- ✗ NO transformation

### Utils (Cross-Cutting)

- ✓ Role mapping
- ✓ Terminology translation
- ✓ Common helpers
- ✗ NO state
- ✗ NO side effects

---

## Security Layers

```
┌─────────────────────────────────────────────────────────────┐
│ Layer 1: Transport Security                                 │
│ • HTTPS encryption                                           │
│ • TLS for Fabric connections                                │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ Layer 2: Authentication                                      │
│ • JWT token validation (authMiddleware)                     │
│ • Supabase user verification                                │
│ • Token expiration checking                                 │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ Layer 3: Authorization                                       │
│ • Role-based permissions (roleMapper)                       │
│ • Ownership verification (canAccessBatch)                   │
│ • Feature-level access (getDashboardFeatures)               │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ Layer 4: Data Filtering                                      │
│ • View mode restrictions (determineViewMode)                │
│ • Technical data hiding (transformToBusinessView)           │
│ • Batch filtering by role                                   │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ Layer 5: Blockchain Security                                │
│ • Wallet-based identity                                     │
│ • Fabric endorsement policies                               │
│ • Immutable ledger                                          │
└─────────────────────────────────────────────────────────────┘
```

---

## Error Handling Flow

```
Error Occurs
     │
     ▼
┌─────────────────┐
│ Service Layer   │ → Log error with context
│ Catches error   │ → Throw formatted error
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Controller      │ → Catch service error
│ Error handler   │ → Determine HTTP status
└────────┬────────┘   - 401: Auth error
         │            - 403: Permission error
         │            - 500: Server error
         ▼
┌─────────────────┐
│ HTTP Response   │ → {
└─────────────────┘     success: false,
                        message: "User-friendly",
                        error: "Technical details"
                      }
```

---

## Scalability Considerations

### Current Architecture

```
Single Backend Instance
        │
        ├──→ Multiple Fabric Peers (load balanced)
        ├──→ Supabase (managed)
        └──→ Wallet files (filesystem)
```

### Future Scaling

```
Load Balancer
        │
        ├──→ Backend Instance 1 ─┐
        ├──→ Backend Instance 2  ├──→ Redis Cache
        └──→ Backend Instance N ─┘        │
                  │                       │
                  └───────┬───────────────┘
                          │
                  ┌───────▼────────┐
                  │ Fabric Network │
                  │ (Multiple orgs)│
                  └────────────────┘
```

Recommendations:

- Add Redis for caching batch lists
- Use session-based wallet management
- Implement connection pooling
- Add rate limiting per role

---

## Monitoring Points

```
1. API Endpoints
   ├─ Request count
   ├─ Response time
   ├─ Error rate
   └─ Status codes

2. Fabric Queries
   ├─ Query duration
   ├─ Connection failures
   ├─ Timeout rate
   └─ Endorsement failures

3. Business Metrics
   ├─ Batches created/day
   ├─ Average trust score
   ├─ Verification rate
   └─ Timeline completeness

4. User Activity
   ├─ Logins by role
   ├─ Feature usage
   ├─ Search queries
   └─ View mode preference
```

---

## Deployment Architecture

```
Production Environment
├── Frontend (Vercel/Netlify)
│   └── React Dashboard
│
├── Backend (AWS EC2 / DigitalOcean)
│   ├── Node.js + Express
│   ├── PM2 Process Manager
│   └── Nginx Reverse Proxy
│
├── Blockchain Network (On-premise / Cloud VMs)
│   ├── Fabric Peers (3+ orgs)
│   ├── Orderers (Raft consensus)
│   └── CouchDB State Database
│
├── Fabric Explorer (Separate VM)
│   └── Docker container
│
└── Supabase (Managed Cloud)
    ├── PostgreSQL
    └── Auth Service
```

---

This architecture provides:

- ✅ Clean separation of concerns
- ✅ Scalable and maintainable
- ✅ Secure by default
- ✅ Business-friendly APIs
- ✅ Technical depth when needed
- ✅ Production-ready
