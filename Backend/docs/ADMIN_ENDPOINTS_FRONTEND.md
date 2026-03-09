# Admin Endpoints – Frontend Reference

All endpoints below require **admin** role. Send `Authorization: Bearer <token>`.

---

## 1. Get all comments (admin)

**Method:** GET  
**Path:** `/api/admin/complaints/comments`  
**Query (optional):**

| Query           | Type   | Description                          |
|-----------------|--------|--------------------------------------|
| `user_id`       | string | Filter comments by complaint user    |
| `complaint_id`  | string | Return only comments for one complaint |

**Response:** `application/json`

```json
{
  "comments": [
    {
      "complaint_id": "<uuid>",
      "order_id": "<string>",
      "user_id": "<string>",
      "user_email": "<string> | null",
      "user_name": "<string> | null",
      "user_complaint": "<string>",
      "status": "<string>",
      "comment": {
        "id": "<string>",
        "role": "user" | "admin",
        "description": "<string>",
        "timestamp": "<ISO string>"
      }
    }
  ]
}
```

- Each item is one comment with complaint context. Use `complaint_id` to group or link to complaint detail.
- **200** on success; **401** Unauthorized; **500** on server error.

---

## 2. Add comment (admin)

**Method:** PATCH  
**Path:** `/api/admin/complaints/:id`  
**Content-Type:** `application/json`  
**Headers:** `Authorization: Bearer <token>`

**Path:** `id` = complaint UUID.

**Request body (all fields optional):**

```json
{
  "comment": "<string>",
  "status": "<string>",
  "image_verification": "<string>"
}
```

- To add an admin reply: send `comment`. It is appended to `comment_thread` with `role: "admin"`.
- You can also update `status` and/or `image_verification` in the same request.

**Response:** `application/json` – full updated complaint (includes `comment_thread` in frontend shape: `id`, `role`, `description`, `timestamp`).

- **200** – success  
- **400** – missing/invalid `id`  
- **401** – Unauthorized  
- **404** – Complaint not found  
- **500** – Server error  

---

### 2b. Mark complaint as resolved (admin)

**Method:** PATCH  
**Path:** `/api/admin/complaints/:id/resolve`  
**Headers:** `Authorization: Bearer <token>`

**Path:** `id` = complaint UUID.

**Request body:** None required (optional empty JSON `{}`).

**Behaviour:** Sets the complaint’s `status` to **`resolved`** and updates `updated_at`. Returns the full updated complaint (including `comment_thread` in frontend shape).

**Response:** `application/json` – full updated complaint row (same shape as PATCH `/:id` response).

- **200** – success  
- **400** – missing `id`  
- **401** – Unauthorized  
- **404** – Complaint not found  
- **500** – Server error  

---

## 3. Fruit grading (admin re-verification)

Same data shape as buyer grading; admin can see **all** orders (no buyer filter).

### 3a. Get all gradings (admin)

**Method:** GET  
**Path:** `/api/admin/gradings`  
**Headers:** `Authorization: Bearer <token>`

**Response:** `application/json`

```json
{
  "success": true,
  "message": "Gradings retrieved successfully",
  "gradings": [
    {
      "grading_id": "<string>",
      "job_id": "<string>",
      "order_id": "<string>",
      "created_at": "<ISO string>",
      "images": [
        {
          "id": "<string>",
          "image_base64": "<string>",
          "predicted_grade": "<string>",
          "accuracy": "<number>",
          "sequence": "<number>",
          "created_at": "<ISO string>"
        }
      ],
      "images_count": <number>
    }
  ],
  "total_gradings": <number>
}
```

- **200** on success; **401** Unauthorized; **500** on error.

### 3b. Get gradings by order (admin)

**Method:** GET  
**Path:** `/api/admin/gradings/:orderId`  
**Headers:** `Authorization: Bearer <token>`

**Path:** `orderId` = order UUID.

**Response:** Same structure as 3a, with `order_id` present in the payload:

```json
{
  "success": true,
  "message": "Gradings retrieved successfully",
  "order_id": "<orderId>",
  "gradings": [ ... ],
  "total_gradings": <number>
}
```

- **200** – success (or empty `gradings: []` if no gradings for that order)  
- **400** – missing `orderId`  
- **401** – Unauthorized  
- **500** – Server error  

### 3c. Verify grading (admin) — same as buyer re-verification; model runs on 5 images

**Method:** POST  
**Path:** `/api/admin/gradings/verify`  
**Content-Type:** `multipart/form-data`  
**Headers:** `Authorization: Bearer <token>`

**Request (same as buyer re-verification):**

| Part name        | Type   | Required | Description                                  |
|------------------|--------|----------|----------------------------------------------|
| `complaint_id`   | string | Yes      | Complaint UUID                               |
| `received_grade` | string | Yes      | Order grade as received (e.g. "Grade A")     |
| `images`         | file   | Yes (×5) | Exactly 5 image files (JPEG, PNG, WebP)       |

**Behaviour:** Backend runs the **fruit grading model** on the 5 uploaded images to get 5 predicted grades.  
- If **all 5** predicted grades equal `received_grade` → complaint `image_verification` is set to **`verified`**, response `message` is **`ok`**.  
- If **not all 5** match → complaint `image_verification` is set to **`failed`**, response `message` is **`verification failed`**.

**Response:** `application/json`

Success (all match):

```json
{
  "success": true,
  "message": "ok",
  "image_verification": "verified",
  "predicted_grades": ["grade a", "grade a", ...],
  "received_grade_normalized": "grade a"
}
```

Verification failed (not all match):

```json
{
  "success": true,
  "message": "verification failed",
  "image_verification": "failed",
  "predicted_grades": ["grade a", "grade b", ...],
  "received_grade_normalized": "grade a"
}
```

- **200** – success (either ok or verification failed)  
- **400** – missing `complaint_id`/`received_grade` or not exactly 5 images  
- **401** – Unauthorized  
- **404** – Complaint not found  
- **503** – Fruit grading model not loaded  
- **500** – Server error  

---

## 4. Get temp details by order (admin)

**Method:** GET  
**Path:** `/api/admin/temps/:orderId`  
**Headers:** `Authorization: Bearer <token>`

**Path:** `orderId` = **placed_order_id** (the buyer-facing order id from `placed_orders`).

**Behaviour:** Finds rows in the **orders** table where `placed_order_id` = `orderId`, gets their `id`, then returns all rows from the **alerts** table where `order_id` is one of those ids (temp-related alerts, e.g. HIGH_TEMP).

**Response:** `application/json`

```json
{
  "success": true,
  "message": "Temp details retrieved",
  "order_id": "<placed_order_id>",
  "alerts": [
    {
      "id": "<uuid>",
      "vehicle_id": "<uuid>",
      "order_id": "<uuid>",
      "alert_type": "HIGH_TEMP",
      "message": "<string>",
      "value_at_time": <number>,
      "created_at": "<ISO string>",
      "is_read": <boolean>,
      "placed_order_id": "<uuid>",
      "optimal_temp_c": <number>,
      "max_safe_temp_c": <number>
    }
  ]
}
```

- **200** – success (or empty `alerts: []` if no transport orders or no alerts)  
- **400** – missing `orderId`  
- **401** – Unauthorized  
- **500** – Server error  
