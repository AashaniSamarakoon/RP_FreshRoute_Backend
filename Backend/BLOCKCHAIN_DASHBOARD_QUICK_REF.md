# Blockchain Dashboard - Quick Reference

## 🚀 Quick Start

```bash
# Start backend
cd Backend
npm start

# Test endpoint
curl http://localhost:4000/api/dashboard/overview \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## 📍 All Endpoints

### Overview & Config

```
GET  /api/dashboard/overview          → Dashboard KPIs
GET  /api/dashboard/config            → User config
GET  /api/dashboard/statistics        → Batch stats
```

### Batches

```
GET  /api/dashboard/batch             → List batches
GET  /api/dashboard/batch/:id         → Batch details
GET  /api/dashboard/batch/search      → Search batches
GET  /api/dashboard/batch/count-by-status → Count by status
GET  /api/dashboard/batch/recent      → Recent batches
```

### Timeline

```
GET  /api/dashboard/timeline/:batchId         → Full timeline
GET  /api/dashboard/timeline/:batchId/summary → Timeline summary
```

### Search

```
GET  /api/dashboard/search              → Global search
POST /api/dashboard/search/advanced     → Advanced search
GET  /api/dashboard/search/suggestions  → Autocomplete
GET  /api/dashboard/search/filters      → Filter options
```

### Trust & Verification

```
GET  /api/dashboard/trust              → Trust dashboard
GET  /api/dashboard/trust/:batchId     → Batch trust score
GET  /api/dashboard/verification/:batchId → Verification status
```

---

## 🔑 Authentication

All endpoints require JWT token:

```javascript
headers: {
  'Authorization': 'Bearer ' + token
}
```

Token must include:

- `id` - User ID
- `role` - User role
- `email` - User email
- `name` - User name

---

## 👥 Roles & Permissions

| Role        | View Tech | See All  | Features                                      |
| ----------- | --------- | -------- | --------------------------------------------- |
| farmer      | ❌        | Own only | batch-list, timeline, verification            |
| buyer       | ❌        | ✅       | batch-search, timeline, verification, quality |
| transporter | ❌        | Assigned | batch-list, timeline, location                |
| admin       | ✅        | ✅       | All features                                  |
| auditor     | ✅        | ✅       | All + audit-trail                             |
| developer   | ✅        | ✅       | All + technical                               |

---

## 🎨 View Modes

### Business View (Default)

```
?view=business
```

- Human-readable labels
- No blockchain jargon
- Status: "Harvested" instead of "CREATED"

### Technical View (Admin/Auditor/Developer)

```
?view=technical
```

- Transaction IDs
- Block numbers
- Fabric Explorer links

---

## 🔄 Status Translation

| Blockchain      | Business   |
| --------------- | ---------- |
| CREATED         | Harvested  |
| PACKED          | Packed     |
| QUALITY_CHECKED | Inspected  |
| IN_TRANSIT      | In Transit |
| DELIVERED       | Delivered  |
| COMPLETED       | Completed  |

---

## 📊 Response Format

All endpoints return:

```json
{
  "success": true,
  "data": { ... },
  "viewMode": "business",  // if applicable
  "count": 10  // if list
}
```

Errors:

```json
{
  "success": false,
  "message": "Error description",
  "error": "Technical details"
}
```

---

## 🔍 Query Parameters

### Batch List

```
?status=CREATED
?productType=Mango
?view=business
```

### Search

```
?q=mango
?type=batch
?dateFrom=2024-01-01
?dateTo=2024-12-31
```

### Recent Batches

```
?limit=10
```

---

## 📝 Example Requests

### Get Dashboard Overview

```bash
curl http://localhost:4000/api/dashboard/overview \
  -H "Authorization: Bearer $TOKEN"
```

### Get Batch Details (Business)

```bash
curl http://localhost:4000/api/dashboard/batch/BATCH001 \
  -H "Authorization: Bearer $TOKEN"
```

### Get Batch Details (Technical)

```bash
curl "http://localhost:4000/api/dashboard/batch/BATCH001?view=technical" \
  -H "Authorization: Bearer $TOKEN"
```

### Search Batches

```bash
curl "http://localhost:4000/api/dashboard/search?q=mango" \
  -H "Authorization: Bearer $TOKEN"
```

### Get Timeline

```bash
curl http://localhost:4000/api/dashboard/timeline/BATCH001 \
  -H "Authorization: Bearer $TOKEN"
```

### Get Trust Score

```bash
curl http://localhost:4000/api/dashboard/trust/BATCH001 \
  -H "Authorization: Bearer $TOKEN"
```

### Advanced Search

```bash
curl -X POST http://localhost:4000/api/dashboard/search/advanced \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "batchId": "BATCH",
    "productType": "Mango",
    "status": "CREATED",
    "dateFrom": "2024-01-01"
  }'
```

---

## 🏗️ Architecture

```
Request → authMiddleware → Controller → Service → Fabric
                                ↓           ↓
                           roleMapper  labelMapper
                                ↓           ↓
                           Response ← DTO ← Transform
```

---

## 📁 File Structure

```
Backend/
├── controllers/dashboard/
│   ├── batchController.js
│   ├── timelineController.js
│   ├── searchController.js
│   └── dashboardMetaController.js
├── Services/
│   ├── blockchain/
│   │   └── fabricQueryService.js
│   └── dashboard/
│       ├── batchService.js
│       ├── timelineService.js
│       └── trustService.js
├── routes/dashboard/
│   └── dashboardRoutes.js
└── utils/
    ├── roleMapper.js
    └── blockchainLabelMapper.js
```

---

## 🛠️ Required Chaincode Functions

```go
ReadBatch(batchId)              // Required
GetAllBatches()                 // Required
GetBatchHistory(batchId)        // Required
GetBatchesByFarmer(farmerId)    // Optional
GetBatchesByBuyer(buyerId)      // Optional
GetBatchesByTransporter(id)     // Optional
```

---

## 🐛 Common Errors

### 401 Unauthorized

```json
{ "message": "Missing token" }
```

→ Add Authorization header

### 403 Forbidden

```json
{ "message": "Access denied" }
```

→ Check role permissions

### 500 Server Error

```json
{ "message": "Failed to query batch" }
```

→ Check Fabric network and chaincode

---

## 🔧 Environment Variables

```bash
# .env
JWT_SECRET=your-secret-key
FABRIC_EXPLORER_URL=http://localhost:8080
```

---

## 📊 Trust Score Factors

1. **Origin Data** (25%) - Farm location, harvest date
2. **Quality Checks** (30%) - Quality grade, inspection notes
3. **Chain Completeness** (20%) - All lifecycle stages recorded
4. **Timestamps** (15%) - Complete time tracking
5. **Verifiers** (10%) - Multiple parties involved

Trust Levels:

- **High**: 80-100
- **Medium**: 60-79
- **Low**: 0-59

---

## 🎯 Frontend Integration

### React Example

```javascript
import axios from "axios";

const api = axios.create({
  baseURL: "http://localhost:4000/api/dashboard",
  headers: {
    Authorization: `Bearer ${token}`,
  },
});

// Get batches
const batches = await api.get("/batch");

// Get timeline
const timeline = await api.get(`/timeline/${batchId}`);

// Search
const results = await api.get(`/search?q=${query}`);
```

---

## 📚 Documentation

- **API Docs**: `BLOCKCHAIN_DASHBOARD_API.md`
- **Implementation**: `BLOCKCHAIN_DASHBOARD_IMPLEMENTATION.md`
- **Summary**: `BLOCKCHAIN_DASHBOARD_SUMMARY.md`
- **Quick Ref**: This file

---

## ✅ Quick Checks

Test endpoints are working:

```bash
# Health check
curl http://localhost:4000/health

# Dashboard config (requires auth)
curl http://localhost:4000/api/dashboard/config \
  -H "Authorization: Bearer $TOKEN"
```

---

## 🚨 Troubleshooting

**Wallet not found?**

```bash
# Generate wallet
node Backend/Services/blockchain/enrollAdmin.js
```

**Can't access batch?**

- Check role permissions
- Verify batch ownership
- Confirm user ID matches

**Technical view not working?**

- Only admin/auditor/developer can use
- Add `?view=technical` parameter

---

## 📞 Support Checklist

Before asking for help:

1. ✅ Is Fabric network running?
2. ✅ Does wallet exist for user?
3. ✅ Is JWT token valid?
4. ✅ Are chaincode functions deployed?
5. ✅ Check logs in Backend directory

---

**Quick Reference v1.0**  
Last Updated: 2024
