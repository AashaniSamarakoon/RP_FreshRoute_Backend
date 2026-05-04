const { supabase } = require("../../utils/supabaseClient");
const { sendComplaintAsMultipart, mapCommentThreadForFrontend } = require("../../utils/complaintMultipart");

/**
 * GET /api/admin/complaints/comments?user_id=optional&complaint_id=optional
 * Get all comments across complaints. Auth: admin.
 * Optional: user_id (filter by complaint user), complaint_id (single complaint).
 * Returns: { comments: [ { complaint_id, order_id, user_id, user_email, user_name, comment: { id, role, description, timestamp } }, ... ] }
 */
const getAllComments = async (req, res) => {
  try {
    if (!req.user?.id) return res.status(401).json({ message: "Unauthorized" });

    const user_id = req.query.user_id ? String(req.query.user_id).trim() : null;
    const complaint_id = req.query.complaint_id ? String(req.query.complaint_id).trim() : null;

    let query = supabase
      .from("complaints")
      .select("id, order_id, user_id, user_email, user_name, user_complaint, status, comment_thread, created_at, updated_at")
      .order("created_at", { ascending: false });
    if (user_id) query = query.eq("user_id", user_id);
    if (complaint_id) query = query.eq("id", complaint_id);

    const { data: rows, error } = await query;
    if (error) {
      console.error("Admin get all comments error:", error);
      return res.status(500).json({ message: error.message || "Failed to fetch comments." });
    }

    const comments = [];
    for (const row of rows || []) {
      const thread = mapCommentThreadForFrontend(row.comment_thread);
      for (const c of thread) {
        comments.push({
          complaint_id: row.id,
          order_id: row.order_id,
          user_id: row.user_id,
          user_email: row.user_email,
          user_name: row.user_name,
          user_complaint: row.user_complaint,
          status: row.status,
          comment: {
            id: c.id,
            role: c.role,
            description: c.description,
            timestamp: c.timestamp,
          },
        });
      }
    }

    res.status(200).json({ comments });
  } catch (err) {
    console.error("Admin get all comments error:", err);
    res.status(500).json({ message: err?.message || "Failed to fetch comments." });
  }
};

/**
 * GET /api/admin/complaints?user_id=optional
 * Get all complaints, optionally filter by user_id. Auth: admin.
 */
const getComplaints = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const user_id = req.query.user_id ? String(req.query.user_id).trim() : null;
    let query = supabase
      .from("complaints")
      .select("id, order_id, user_id, user_email, user_name, user_complaint, status, comments, image_verification, comment_thread, farmer_id, created_at, updated_at")
      .order("created_at", { ascending: false });
    if (user_id) query = query.eq("user_id", user_id);

    const { data: rows, error } = await query;

    if (error) {
      console.error("Admin get complaints error:", error);
      return res.status(500).json({ message: error.message || "Failed to fetch complaints." });
    }
    const complaints = (rows || []).map((r) => ({
      ...r,
      comment_thread: mapCommentThreadForFrontend(r.comment_thread),
    }));
    res.status(200).json({ complaints });
  } catch (err) {
    console.error("Admin get complaints error:", err);
    res.status(500).json({ message: err?.message || "Failed to fetch complaints." });
  }
};

/**
 * GET /api/admin/complaints/:id
 * Get one complaint by id. Auth: admin.
 * Response: multipart/form-data with part "complaint" (JSON, no images) and parts "image_0", "image_1", ... (binary files).
 */
const getComplaintById = async (req, res) => {
  try {
    if (!req.user?.id) return res.status(401).json({ message: "Unauthorized" });

    const { id } = req.params;
    if (!id) return res.status(400).json({ message: "Complaint id is required" });

    const { data: row, error } = await supabase
      .from("complaints")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !row) return res.status(404).json({ message: "Complaint not found" });
    sendComplaintAsMultipart(res, row);
  } catch (err) {
    console.error("Admin get complaint error:", err);
    res.status(500).json({ message: err?.message || "Failed to fetch complaint." });
  }
};

/**
 * PATCH /api/admin/complaints/:id/resolve
 * Set complaint status to "resolved". Auth: admin.
 */
const setComplaintResolved = async (req, res) => {
  try {
    if (!req.user?.id) return res.status(401).json({ message: "Unauthorized" });

    const { id } = req.params;
    if (!id) return res.status(400).json({ message: "Complaint id is required" });

    const { data: updated, error } = await supabase
      .from("complaints")
      .update({
        status: "resolved",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Admin set complaint resolved error:", error);
      return res.status(error.code === "PGRST116" ? 404 : 500).json({
        message: error.code === "PGRST116" ? "Complaint not found" : error.message || "Failed to update complaint.",
      });
    }
    const response = {
      ...updated,
      comment_thread: mapCommentThreadForFrontend(updated.comment_thread),
    };
    res.status(200).json(response);
  } catch (err) {
    console.error("Admin setComplaintResolved error:", err);
    res.status(500).json({ message: err?.message || "Failed to update complaint." });
  }
};

/**
 * PATCH /api/admin/complaints/:id
 * Update complaint: add admin comment and/or status and/or image_verification. Body: { comment?: string, status?: string, image_verification?: string }
 * Appends to comment_thread with role "admin" when comment is provided.
 */
const updateComplaint = async (req, res) => {
  try {
    if (!req.user?.id) return res.status(401).json({ message: "Unauthorized" });

    const { id } = req.params;
    const { comment, status, image_verification: imageVerification } = req.body || {};
    if (!id) return res.status(400).json({ message: "Complaint id is required" });

    const { data: row, error: fetchErr } = await supabase
      .from("complaints")
      .select("id, comment_thread")
      .eq("id", id)
      .single();

    if (fetchErr || !row) return res.status(404).json({ message: "Complaint not found" });

    const updates = { updated_at: new Date().toISOString() };
    const commentText = typeof comment === "string" ? comment.trim() : String(comment || "").trim();

    if (commentText) {
      const thread = Array.isArray(row.comment_thread) ? row.comment_thread : [];
      updates.comment_thread = [...thread, { role: "admin", comment: commentText, added_at: new Date().toISOString() }];
      updates.status = "admin_reviewed"; // set status when admin adds a comment (can be overridden by body.status)
    }
    if (status !== undefined && status !== null) updates.status = String(status).trim();
    if (imageVerification !== undefined && imageVerification !== null) updates.image_verification = String(imageVerification).trim();

    const { data: updated, error: updateErr } = await supabase
      .from("complaints")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (updateErr) {
      console.error("Admin update complaint error:", updateErr);
      return res.status(500).json({ message: updateErr.message || "Failed to update complaint." });
    }
    const response = {
      ...updated,
      comment_thread: mapCommentThreadForFrontend(updated.comment_thread),
    };
    res.status(200).json(response);
  } catch (err) {
    console.error("Admin update complaint error:", err);
    res.status(500).json({ message: err?.message || "Failed to update complaint." });
  }
};

module.exports = { getAllComments, getComplaints, getComplaintById, setComplaintResolved, updateComplaint };
