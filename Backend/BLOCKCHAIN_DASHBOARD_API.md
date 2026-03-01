# Blockchain Dashboard API Documentation

## Overview

This document describes the **business-first, role-based blockchain dashboard** extension to the FreshRoute Backend. The dashboard provides clean, traceability-focused APIs for a fruit supply chain while keeping Hyperledger Fabric Explorer as a technical tool only.

## Architecture

### Key Principles

1. **Extends existing backend** - does not replace it
2. **Business users never see blockchain jargon** - terminology is translated
3. **Role-based access control** - using existing Supabase auth
4. **Fabric is source of truth** - all data comes from blockchain
5. **Two view modes** - Business (default) and Technical (restricted)

### New Components

```
Backend/
├── controllers/dashboard/          # NEW - Dashboard API controllers
│   ├── batchController.js          # Batch explorer endpoints
│   ├── timelineController.js       # Product lifecycle timeline
│   ├── searchController.js         # Global search
│   └── dashboardMetaController.js  # KPIs, stats, trust scores
│
├── Services/
│   ├── blockchain/
│   │   └── fabricQueryService.js   # NEW - Read-optimized Fabric queries
│   │
│   └── dashboard/                  # NEW - Business logic services
│       ├── batchService.js         # Batch DTOs and business logic
│       ├── timelineService.js      # Timeline generation
│       └── trustService.js         # Trust score calculation
│
├── routes/dashboard/               # NEW - Dashboard routes
│   ├── batchRoutes.js
│   ├── timelineRoutes.js
│   ├── searchRoutes.js
│   └── dashboardRoutes.js          # Main dashboard router
│
└── utils/
    ├── roleMapper.js               # NEW - Role to permissions mapping
    └── blockchainLabelMapper.js    # NEW - Terminology translation
```

---

## API Endpoints

### Base URL

```
/api/dashboard
```

All endpoints require authentication via Bearer token.

---

## 1. Dashboard Overview

### Get Dashboard Overview

```http
GET /api/dashboard/overview
```

Returns KPIs, recent batches, trust metrics, and available features.

**Response:**

```json
{
  "success": true,
  "data": {
    "batchCounts": {
      "total": 125,
      "harvested": 45,
      "packed": 30,
      "inspected": 20,
      "inTransit": 15,
      "delivered": 15
    },
    "recentBatches": [...],
    "trust": {
      "averageTrustScore": 85,
      "totalBatches": 125,
      "trustLevelCounts": {
        "High": 90,
        "Medium": 30,
        "Low": 5
      }
    },
    "availableFeatures": ["batch-list", "timeline", "verification"],
    "userRole": "farmer"
  }
}
```

### Get Dashboard Configuration

```http
GET /api/dashboard/config
```

Returns dashboard configuration for the current user.

**Response:**

```json
{
  "success": true,
  "data": {
    "userRole": "farmer",
    "userName": "John Farmer",
    "userEmail": "john@example.com",
    "availableFeatures": ["batch-list", "timeline", "verification"],
    "viewModes": {
      "canViewTechnical": false,
      "canAccessExplorer": false
    },
    "explorerUrl": "http://localhost:8080"
  }
}
```

---

## 2. Batch Explorer

### Get Batch Details

```http
GET /api/dashboard/batch/:id?view=business
```

**Query Parameters:**

- `view` (optional): `business` (default) or `technical`

**Business View Response:**

```json
{
  "success": true,
  "data": {
    "batchId": "BATCH001",
    "productType": "Mango",
    "quantity": 500,
    "unit": "kg",
    "origin": "Dambulla Farm",
    "currentOwner": "John Farmer",
    "statusLabel": "Harvested",
    "harvestedDate": "Dec 25, 2023 at 8:00 AM",
    "lastUpdated": "Dec 26, 2023 at 2:30 PM",
    "isVerified": true,
    "verificationScore": 3,
    "verificationPercentage": 100,
    "qualityGrade": "A",
    "farmerName": "John Farmer"
  },
  "viewMode": "business"
}
```

**Technical View Response** (admin/auditor/developer only):

```json
{
  "success": true,
  "data": {
    "batchId": "BATCH001",
    "productType": "Mango",
    // ... all business fields ...
    "technical": {
      "createdBy": "farmer-123",
      "createdAt": "2023-12-25T08:00:00Z",
      "updatedBy": "farmer-123",
      "updatedAt": "2023-12-26T14:30:00Z",
      "docType": "batch"
    }
  },
  "viewMode": "technical"
}
```

### Get Batch List

```http
GET /api/dashboard/batch?status=CREATED&productType=Mango&view=business
```

**Query Parameters:**

- `status` (optional): Filter by status
- `productType` (optional): Filter by product type
- `view` (optional): `business` or `technical`

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "batchId": "BATCH001",
      "productType": "Mango",
      "quantity": 500,
      "unit": "kg",
      "statusLabel": "Harvested",
      "origin": "Dambulla Farm",
      "harvestedDate": "Dec 25, 2023",
      "currentOwner": "John Farmer",
      "farmerName": "John Farmer",
      "isVerified": true
    }
  ],
  "count": 1,
  "viewMode": "business",
  "filters": {
    "status": "CREATED",
    "productType": "Mango"
  }
}
```

### Get Batch Count by Status

```http
GET /api/dashboard/batch/count-by-status
```

**Response:**

```json
{
  "success": true,
  "data": {
    "harvested": 45,
    "packed": 30,
    "inspected": 20,
    "inTransit": 15,
    "delivered": 15,
    "total": 125
  }
}
```

### Get Recent Batches

```http
GET /api/dashboard/batch/recent?limit=10
```

**Response:**

```json
{
  "success": true,
  "data": [...],
  "count": 10
}
```

---

## 3. Product Timeline

### Get Batch Timeline

```http
GET /api/dashboard/timeline/:batchId?view=business
```

**Business View Response:**

```json
{
  "success": true,
  "data": {
    "batchId": "BATCH001",
    "productType": "Mango",
    "totalEvents": 5,
    "events": [
      {
        "id": "event-1",
        "type": "Batch Created",
        "timestamp": "2023-12-25T08:00:00Z",
        "dateTime": "Dec 25, 2023 at 8:00 AM",
        "relativeTime": "2 days ago",
        "actor": "John Farmer",
        "description": "Batch created by John Farmer at Dambulla Farm",
        "verified": true,
        "location": "Dambulla Farm"
      },
      {
        "id": "event-2",
        "type": "Quality Inspection",
        "timestamp": "2023-12-25T10:00:00Z",
        "dateTime": "Dec 25, 2023 at 10:00 AM",
        "relativeTime": "2 days ago",
        "actor": "Quality Inspector",
        "description": "Quality inspection completed. Grade: A",
        "verified": true,
        "status": "QUALITY_CHECKED"
      }
    ],
    "milestones": {
      "harvested": {
        "date": "2023-12-25T08:00:00Z",
        "actor": "John Farmer",
        "verified": true
      },
      "packed": {
        "date": "2023-12-25T09:00:00Z",
        "actor": "John Farmer",
        "verified": true
      },
      "inspected": {
        "date": "2023-12-25T10:00:00Z",
        "actor": "Quality Inspector",
        "verified": true
      },
      "shipped": null,
      "delivered": null,
      "completed": null
    }
  },
  "viewMode": "business"
}
```

**Technical View** includes explorer links:

```json
{
  "events": [
    {
      "id": "event-1",
      "type": "Batch Created",
      // ... business fields ...
      "technical": {
        "txId": "abc123...",
        "blockNumber": 42,
        "channelId": "freshroute-channel",
        "isDelete": false,
        "explorerLink": "http://localhost:8080/#/transaction/freshroute-channel/abc123..."
      }
    }
  ]
}
```

### Get Timeline Summary

```http
GET /api/dashboard/timeline/:batchId/summary
```

**Response:**

```json
{
  "success": true,
  "data": {
    "batchId": "BATCH001",
    "totalEvents": 5,
    "milestones": {...},
    "latestEvent": {...},
    "completionPercentage": 50
  }
}
```

---

## 4. Search

### Global Search

```http
GET /api/dashboard/search?q=mango&type=batch&dateFrom=2024-01-01
```

**Query Parameters:**

- `q`: Search query
- `type`: Search type (default: `batch`)
- `dateFrom`: Start date filter
- `dateTo`: End date filter

**Response:**

```json
{
  "success": true,
  "data": [...],
  "count": 15,
  "searchType": "batch",
  "query": "mango",
  "viewMode": "business"
}
```

### Advanced Search

```http
POST /api/dashboard/search/advanced
Content-Type: application/json

{
  "batchId": "BATCH",
  "productType": "Mango",
  "farmerId": "farmer-123",
  "status": "CREATED",
  "dateFrom": "2024-01-01",
  "dateTo": "2024-12-31"
}
```

### Get Search Suggestions (Autocomplete)

```http
GET /api/dashboard/search/suggestions?q=man&field=productType
```

**Response:**

```json
{
  "success": true,
  "data": ["Mango", "Mandarin"],
  "field": "productType",
  "query": "man"
}
```

### Get Filter Options

```http
GET /api/dashboard/search/filters
```

**Response:**

```json
{
  "success": true,
  "data": {
    "productTypes": ["Mango", "Banana", "Papaya"],
    "statuses": [
      { "value": "CREATED", "label": "Harvested" },
      { "value": "PACKED", "label": "Packed" },
      { "value": "QUALITY_CHECKED", "label": "Inspected" }
    ],
    "farmers": ["John Farmer", "Jane Farmer"]
  }
}
```

---

## 5. Trust & Verification

### Get Batch Trust Score

```http
GET /api/dashboard/trust/:batchId
```

**Response:**

```json
{
  "success": true,
  "data": {
    "batchId": "BATCH001",
    "trustScore": 85,
    "trustLevel": "High",
    "factors": {
      "hasOriginData": 100,
      "hasQualityChecks": 100,
      "hasCompleteChain": 80,
      "hasTimestamps": 100,
      "hasMultipleVerifiers": 70
    },
    "recommendations": ["Ensure all lifecycle stages are recorded"]
  }
}
```

### Get Trust Dashboard

```http
GET /api/dashboard/trust
```

**Response:**

```json
{
  "success": true,
  "data": {
    "totalBatches": 125,
    "averageTrustScore": 85,
    "trustLevelCounts": {
      "High": 90,
      "Medium": 30,
      "Low": 5
    },
    "trustLevelPercentages": {
      "High": 72,
      "Medium": 24,
      "Low": 4
    },
    "topBatches": [...]
  }
}
```

### Get Verification Status

```http
GET /api/dashboard/verification/:batchId
```

**Response:**

```json
{
  "success": true,
  "data": {
    "batchId": "BATCH001",
    "isVerified": true,
    "verificationScore": 3,
    "maxScore": 3,
    "verificationPercentage": 100,
    "checks": {
      "origin": true,
      "quality": true,
      "transport": true
    },
    "qualityCheckCount": 2,
    "lastVerified": "2023-12-25T10:00:00Z"
  }
}
```

---

## Role-Based Access Control

### Roles

| Role        | View Technical | Access Explorer | View All Batches   | Features                                          |
| ----------- | -------------- | --------------- | ------------------ | ------------------------------------------------- |
| farmer      | ❌             | ❌              | ❌ (own only)      | batch-list, timeline, verification                |
| buyer       | ❌             | ❌              | ✅                 | batch-search, timeline, verification, quality     |
| transporter | ❌             | ❌              | ❌ (assigned only) | batch-list, timeline, location                    |
| admin       | ✅             | ✅              | ✅                 | All features                                      |
| auditor     | ✅             | ✅              | ✅                 | batch-search, timeline, verification, audit-trail |
| developer   | ✅             | ✅              | ✅                 | All features + technical                          |

### View Modes

**Business View (Default)**

- Human-readable labels
- Status-based (Harvested, Packed, Inspected)
- Timeline-based navigation
- No blockchain jargon
- Verification indicators

**Technical View (Restricted)**

- Transaction IDs
- Block numbers
- Channel names
- Endorsing organizations
- Deep links to Fabric Explorer
- Full blockchain metadata

---

## Terminology Translation

The API automatically translates blockchain terminology to business-friendly labels:

| Blockchain Term | Business Label |
| --------------- | -------------- |
| Transaction     | Event          |
| Block           | Record         |
| Channel         | Network        |
| Endorsement     | Verification   |
| Hash            | Proof          |
| Committed       | Confirmed      |
| Pending         | In Progress    |

---

## Authentication

All dashboard endpoints require a valid JWT token:

```http
Authorization: Bearer <your-jwt-token>
```

The token should include:

- `id`: User ID
- `role`: User role (farmer, buyer, transporter, admin, auditor, developer)
- `email`: User email
- `name`: User name

---

## Error Responses

### 401 Unauthorized

```json
{
  "success": false,
  "message": "Missing token"
}
```

### 403 Forbidden

```json
{
  "success": false,
  "message": "Access denied: You do not have permission to view this batch"
}
```

### 500 Internal Server Error

```json
{
  "success": false,
  "message": "Failed to retrieve batch details",
  "error": "Wallet for user not found"
}
```

---

## Integration with Existing Backend

The dashboard routes are registered in `index.js`:

```javascript
app.use("/api/dashboard", authMiddleware, blockchainDashboardRoutes);
```

This allows:

- Existing mobile apps to continue working
- New dashboard to use the same backend
- Shared authentication and authorization
- Unified API architecture

---

## Fabric Explorer Integration

Fabric Explorer remains **unchanged** and is used ONLY for:

1. **Deep Links** - Technical view provides explorer links for transactions and blocks
2. **Developer Troubleshooting** - Developers and auditors can access raw blockchain data
3. **Verification** - Auditors can verify blockchain state

**Fabric Explorer is NOT:**

- Embedded in the dashboard
- A dependency for core dashboard logic
- Exposed to business users

---

## Environment Variables

Add to `.env`:

```bash
# Fabric Explorer URL (for technical view deep links)
FABRIC_EXPLORER_URL=http://localhost:8080
```

---

## Example Usage

### 1. Farmer Views Their Batches

```javascript
// Login as farmer
POST /api/auth/login
{
  "email": "farmer@example.com",
  "password": "password"
}

// Get dashboard overview
GET /api/dashboard/overview
Authorization: Bearer <farmer-token>

// View batch list (only shows farmer's batches)
GET /api/dashboard/batch
Authorization: Bearer <farmer-token>
```

### 2. Buyer Searches for Mangos

```javascript
// Login as buyer
POST /api/auth/login
{
  "email": "buyer@example.com",
  "password": "password"
}

// Search for mango batches
GET /api/dashboard/search?q=mango&type=batch
Authorization: Bearer <buyer-token>

// View batch timeline
GET /api/dashboard/timeline/BATCH001
Authorization: Bearer <buyer-token>
```

### 3. Auditor Verifies Batch in Technical Mode

```javascript
// Login as auditor
POST /api/auth/login
{
  "email": "auditor@example.com",
  "password": "password"
}

// View batch in technical mode
GET /api/dashboard/batch/BATCH001?view=technical
Authorization: Bearer <auditor-token>

// Response includes explorer links for verification
{
  "data": {
    "batchId": "BATCH001",
    // ... business fields ...
    "technical": {
      "txId": "abc123...",
      "explorerLink": "http://localhost:8080/#/transaction/..."
    }
  }
}
```

---

## Best Practices

1. **Always authenticate** - All endpoints require valid JWT tokens
2. **Use business view by default** - Only switch to technical view when needed
3. **Filter by role** - The API automatically filters batches based on user role
4. **Check permissions** - Use `/api/dashboard/config` to see what the user can access
5. **Handle errors gracefully** - Check for 403 errors (access denied) and 500 errors (server issues)

---

## Future Enhancements

- **Real-time updates** - WebSocket support for live batch status updates
- **Export functionality** - Download batch reports as PDF/CSV
- **Analytics dashboard** - Advanced charts and insights
- **Batch predictions** - ML-based quality predictions
- **Mobile app integration** - React Native SDK for dashboard features

---

## Support

For issues or questions:

- Check existing blockchain logs in `Backend/Services/blockchain/`
- Verify Fabric network is running
- Ensure user wallet exists in `Backend/wallet/`
- Check Supabase authentication is working

---

## License

Same as FreshRoute Backend (refer to main LICENSE file)
