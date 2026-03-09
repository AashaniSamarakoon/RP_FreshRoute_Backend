const crypto = require("crypto");
const { supabase } = require("../../utils/supabaseClient");
const { sendComplaintAsMultipart, mapCommentThreadForFrontend } = require("../../utils/complaintMultipart");

/**
 * Create complaint (used by the app)
 * POST /api/buyer/complaints
 * Auth: Bearer token. Buyer role.
 * Content-Type: multipart/form-data
 * Fields: order_id, reason, status, comments
 * Files: images (up to 5 image files) – converted to base64 and stored
 *
 * RESPONSE TYPES (for frontend):
 *
 * 201 Created – success
 *   { success: true, message: "Complaint submitted successfully." }
 *
 * 409 Conflict – complaint already exists for this order_id (includes existing complaint)
 *   { success: false, code: "COMPLAINT_EXISTS", message: "A complaint already exists for this order", complaint: { id, order_id, status, user_complaint, comments, created_at, updated_at } }
 *
 * 400 Bad Request – validation (missing order_id or reason)
 *   { message: string }
 *
 * 401 Unauthorized
 *   { message: "Unauthorized" }
 *
 * 403 Forbidden
 *   { message: "Buyer profile not found" }
 *
 * 404 Not Found
 *   { message: "Order not found or you do not have access to this order" }
 *
 * 500 Server Error
 *   { message: string }
 */
const createComplaint = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { order_id, reason, status, comments, image_verification: imageVerificationReq } = req.body || {};

    if (!order_id || typeof order_id !== "string") {
      return res.status(400).json({ message: "order_id is required" });
    }
    const orderId = order_id.trim();
    if (!orderId) {
      return res.status(400).json({ message: "order_id is required" });
    }

    if (reason === undefined || reason === null) {
      return res.status(400).json({ message: "reason is required" });
    }
    const reasonText = typeof reason === "string" ? reason.trim() : String(reason).trim();
    if (!reasonText) {
      return res.status(400).json({ message: "reason is required" });
    }

    // Resolve buyer: ensure user is a buyer
    const { data: buyerData, error: buyerError } = await supabase
      .from("buyers")
      .select("user_id")
      .eq("user_id", userId)
      .single();

    if (buyerError || !buyerData) {
      return res.status(403).json({ message: "Buyer profile not found" });
    }

    // Verify order exists and belongs to this buyer
    const { data: order, error: orderError } = await supabase
      .from("placed_orders")
      .select("id, buyer_id")
      .eq("id", orderId)
      .eq("buyer_id", buyerData.user_id)
      .single();

    if (orderError || !order) {
      return res.status(404).json({
        message: "Order not found or you do not have access to this order",
      });
    }

    // One complaint per order: check if complaint already exists and fetch it for the frontend
    const { data: existing, error: existingError } = await supabase
      .from("complaints")
      .select("id, order_id, status, user_complaint, comments, image_verification, created_at, updated_at")
      .eq("order_id", orderId)
      .maybeSingle();

    if (existingError) {
      console.error("Complaint check error:", existingError);
      return res.status(500).json({ message: "Failed to submit complaint. Please try again." });
    }
    if (existing) {
      return res.status(409).json({
        success: false,
        code: "COMPLAINT_EXISTS",
        message: "A complaint already exists for this order",
        complaint: existing,
      });
    }

    // Convert uploaded image files to base64 (req.files from multer); pad to 5 entries
    const files = Array.isArray(req.files) ? req.files : [];
    const imagesValue = files
      .slice(0, 5)
      .map((f) => (f.buffer ? f.buffer.toString("base64") : ""));
    while (imagesValue.length < 5) imagesValue.push("");

    const statusValue = status === "in_review" ? "in_review" : (status || "in_review");
    const commentsValue = typeof comments === "string" ? comments : (comments != null ? String(comments) : "");
    const imageVerificationValue =
      typeof imageVerificationReq === "string" && imageVerificationReq.trim()
        ? imageVerificationReq.trim()
        : "pending";

    // Store the submitting user (id, email, name) with the complaint
    const userName = [req.user.first_name, req.user.last_name].filter(Boolean).join(" ") || null;
    const userEmail = req.user.email || null;

    const row = {
      order_id: orderId,
      user_id: userId,
      user_email: userEmail,
      user_name: userName,
      user_complaint: reasonText,
      agent_description: "",
      proofs: "",
      status: statusValue,
      comments: commentsValue,
      image_verification: imageVerificationValue,
      images: imagesValue,
    };

    const { error: insertError } = await supabase.from("complaints").insert(row);

    if (insertError) {
      console.error("Complaint insert error:", insertError);
      return res.status(500).json({
        message: insertError.message || "Failed to submit complaint. Please try again.",
      });
    }

    res.status(201).json({ success: true, message: "Complaint submitted successfully." });
  } catch (err) {
    console.error("Create complaint error:", err);
    res.status(500).json({
      message: err?.message || "Failed to submit complaint. Please try again.",
    });
  }
};

/**
 * GET /api/buyer/complaints
 * Get all complaints for the current user (buyer). Auth: buyer.
 */
const getComplaintsByUser = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const { data: buyerData, error: buyerError } = await supabase
      .from("buyers")
      .select("user_id")
      .eq("user_id", userId)
      .single();
    if (buyerError || !buyerData) return res.status(403).json({ message: "Buyer profile not found" });

    const { data: rows, error } = await supabase
      .from("complaints")
      .select("id, order_id, user_id, user_email, user_name, user_complaint, status, comments, image_verification, comment_thread, created_at, updated_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Get complaints error:", error);
      return res.status(500).json({ message: error.message || "Failed to fetch complaints." });
    }
    const complaints = (rows || []).map((r) => ({
      ...r,
      comment_thread: mapCommentThreadForFrontend(r.comment_thread),
    }));
    res.status(200).json({ complaints });
  } catch (err) {
    console.error("Get complaints by user error:", err);
    res.status(500).json({ message: err?.message || "Failed to fetch complaints." });
  }
};

/**
 * GET /api/buyer/complaints/:id
 * Get one complaint by id. Buyer can only access their own.
 * Response: multipart/form-data with part "complaint" (JSON, no images) and parts "image_0", "image_1", ... (binary files).
 */
const getComplaintById = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const { id } = req.params;
    if (!id) return res.status(400).json({ message: "Complaint id is required" });

    const { data: row, error } = await supabase
      .from("complaints")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !row) return res.status(404).json({ message: "Complaint not found" });
    if (row.user_id !== userId) return res.status(403).json({ message: "You do not have access to this complaint" });

    sendComplaintAsMultipart(res, row);
  } catch (err) {
    console.error("Get complaint by id error:", err);
    res.status(500).json({ message: err?.message || "Failed to fetch complaint." });
  }
};

/**
 * POST /api/buyer/complaints/:id/comment
 * Add a comment to a complaint (user role). Body: { comment: string }
 * Appends to comment_thread with role "user".
 */
const addComment = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const { id } = req.params;
    const { comment } = req.body || {};
    if (!id) return res.status(400).json({ message: "Complaint id is required" });
    const commentText = typeof comment === "string" ? comment.trim() : String(comment || "").trim();
    if (!commentText) return res.status(400).json({ message: "comment is required" });

    const { data: row, error: fetchErr } = await supabase
      .from("complaints")
      .select("id, user_id, comment_thread")
      .eq("id", id)
      .single();

    if (fetchErr || !row) return res.status(404).json({ message: "Complaint not found" });
    if (row.user_id !== userId) return res.status(403).json({ message: "You do not have access to this complaint" });

    const thread = Array.isArray(row.comment_thread) ? row.comment_thread : [];
    const entry = { role: "user", comment: commentText, added_at: new Date().toISOString() };
    const newThread = [...thread, entry];

    const { error: updateErr } = await supabase
      .from("complaints")
      .update({ comment_thread: newThread, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (updateErr) {
      console.error("Add comment error:", updateErr);
      return res.status(500).json({ message: updateErr.message || "Failed to add comment." });
    }
    res.status(200).json({ success: true, comment: entry });
  } catch (err) {
    console.error("Add comment error:", err);
    res.status(500).json({ message: err?.message || "Failed to add comment." });
  }
};

module.exports = { createComplaint, getComplaintsByUser, getComplaintById, addComment };
