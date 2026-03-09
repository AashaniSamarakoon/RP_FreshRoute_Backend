# Complaints API – Request & Response (Frontend)

## Request: Create complaint (buyer)

**Method:** POST  
**Path:** `/api/buyer/complaints`  
**Content-Type:** `multipart/form-data` (client sets boundary; do not send Content-Type from backend on the request).  
**Headers:** `Authorization: Bearer <token>`

| Part name            | Type   | Required | Description                                      |
|----------------------|--------|----------|--------------------------------------------------|
| order_id             | string | Yes      | Order ID for this complaint                      |
| reason               | string | Yes      | Complaint reason text                            |
| status               | string | Yes      | Always `"in_review"`                             |
| comments             | string | Yes      | Empty string `""`                                |
| image_verification   | string | Yes      | Always `"pending"` — images not yet verified     |
| images               | file   | Yes (×5) | Same field name `images`; 5 image files          |

---

## Response structures (all complaint-related endpoints)

### 1. POST /api/buyer/complaints — Create complaint

| Status | Content-Type   | Body |
|--------|----------------|------|
| **201** | application/json | `{ "success": true, "message": "Complaint submitted successfully." }` |
| **409** | application/json | `{ "success": false, "code": "COMPLAINT_EXISTS", "message": "A complaint already exists for this order", "complaint": { "id", "order_id", "status", "user_complaint", "comments", "image_verification", "created_at", "updated_at" } }` |
| 400/401/403/404/500 | application/json | `{ "message": "<string>" }` |

---

### 2. GET /api/buyer/complaints — List complaints (current user)

**Response:** `application/json`

```json
{
  "complaints": [
    {
      "id": "<uuid>",
      "order_id": "<string>",
      "user_id": "<string>",
      "user_email": "<string> | null",
      "user_name": "<string> | null",
      "user_complaint": "<string>",
      "status": "<string>",
      "comments": "<string>",
      "image_verification": "<string>",
      "comment_thread": [ { "id": "<uuid>", "role": "user"|"admin", "description": "<string>", "timestamp": "<ISO string>" } ],
      "created_at": "<ISO string>",
      "updated_at": "<ISO string>"
    }
  ]
}
```

---

### 3. GET /api/buyer/complaints/:id — Get one complaint (with images as files)

**Response:** `multipart/form-data; boundary=----ComplaintBoundary...`

- **Part `complaint`** (application/json): complaint object with **no** `images` array; includes `image_verification`:

```json
{
  "id": "<uuid>",
  "order_id": "<string>",
  "user_id": "<string>",
  "user_email": "<string> | null",
  "user_name": "<string> | null",
  "user_complaint": "<string>",
  "agent_description": "<string>",
  "proofs": "<string>",
  "status": "<string>",
  "comments": "<string>",
  "image_verification": "<string>",
  "images": [],
  "comment_thread": [ { "id": "<uuid>", "role": "user"|"admin", "description": "<string>", "timestamp": "<ISO string>" } ],
  "created_at": "<ISO string>",
  "updated_at": "<ISO string>"
}
```

- **Parts `image_0`, `image_1`, ...**: binary image files (one per stored image).

---

### 4. POST /api/buyer/complaints/:id/comment — Add comment (user)

**Request body:** `application/json` → `{ "comment": "<string>" }`

Date/time is set by the backend when the comment is stored.

**Response:** `application/json`
```json
{
  "success": true,
  "comment": {
    "id": "<uuid>",
    "role": "user",
    "description": "<string>",
    "timestamp": "<ISO string>"
  }
}
```

---

### 5. GET /api/admin/complaints — List all complaints (admin)

**Query:** optional `?user_id=<string>` to filter by user.

**Response:** `application/json`

```json
{
  "complaints": [
    {
      "id": "<uuid>",
      "order_id": "<string>",
      "user_id": "<string>",
      "user_email": "<string> | null",
      "user_name": "<string> | null",
      "user_complaint": "<string>",
      "status": "<string>",
      "comments": "<string>",
      "image_verification": "<string>",
      "comment_thread": [ { "id": "<uuid>", "role": "user"|"admin", "description": "<string>", "timestamp": "<ISO string>" } ],
      "created_at": "<ISO string>",
      "updated_at": "<ISO string>"
    }
  ]
}
```

---

### 6. GET /api/admin/complaints/:id — Get one complaint (admin)

Same as **GET /api/buyer/complaints/:id**: `multipart/form-data` with part `complaint` (includes `image_verification`, `images: []`) and parts `image_0`, `image_1`, ...

---

### 7. PATCH /api/admin/complaints/:id — Update complaint (admin)

**Request body:** `application/json`

```json
{
  "comment": "<string>",
  "status": "<string>",
  "image_verification": "<string>"
}
```

All fields optional. If `comment` is sent, it is appended to `comment_thread` with `role: "admin"`.

**Response:** `application/json` — full updated complaint row (includes `image_verification`).

---

## Summary: `image_verification` usage

- **Create:** Sent as form field `image_verification` (e.g. `"pending"`); stored and returned in 409 `complaint` when duplicate.
- **List (buyer & admin):** Included in each item in `complaints[]`.
- **Get by id (buyer & admin):** Included in the `complaint` part of the multipart response.
- **PATCH (admin):** Can update via body `image_verification`; returned in the updated complaint.

Run migration `007_complaints_image_verification.sql` (or add column `image_verification VARCHAR(50) DEFAULT 'pending'`) if the column does not exist yet.
