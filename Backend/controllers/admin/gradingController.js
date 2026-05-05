const { supabase } = require("../../utils/supabaseClient");
const fruitGradingService = require("../../Services/fruitGrading/fruitGradingService");

/**
 * Normalize grade for comparison: "Grade A", "Grade_A", "A" -> "grade a".
 */
function normalizeGrade(g) {
  if (g == null || typeof g !== "string") return "";
  const s = g.trim().toLowerCase().replace(/_/g, " ");
  if (/^[abc]$/.test(s)) return `grade ${s}`;
  return s;
}

/**
 * POST /api/admin/gradings/verify
 * Multipart (same as buyer re-verification): 5 images + complaint_id + received_grade (order grade).
 * Runs fruit grading model on the 5 images; if all 5 predicted grades equal received_grade
 * -> image_verification = 'verified', response ok; else -> image_verification = 'failed', response verification failed.
 */
const verifyGrading = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

    const complaint_id = req.body?.complaint_id != null ? String(req.body.complaint_id).trim() : "";
    const received_grade = req.body?.received_grade != null ? String(req.body.received_grade).trim() : "";

    if (!complaint_id || !received_grade) {
      return res.status(400).json({
        success: false,
        message: "complaint_id and received_grade are required (form fields)",
      });
    }

    const files = req.files && Array.isArray(req.files) ? req.files : [];
    if (files.length !== 5) {
      return res.status(400).json({
        success: false,
        message: "Exactly 5 images are required (same as buyer re-verification)",
      });
    }

    const { data: complaint, error: complaintError } = await supabase
      .from("complaints")
      .select("id, order_id")
      .eq("id", complaint_id)
      .single();

    if (complaintError || !complaint) {
      return res.status(404).json({ success: false, message: "Complaint not found" });
    }

    if (!fruitGradingService.session) {
      return res.status(503).json({
        success: false,
        message: "Fruit grading model not loaded. Please try again later.",
      });
    }

    const imageBuffers = files.map((f) => f.buffer);
    const predictions = await fruitGradingService.predictBatch(imageBuffers);

    const predictedGrades = predictions.map((p) => normalizeGrade(p.className));
    const receivedNorm = normalizeGrade(received_grade);
    const allMatch = predictedGrades.length === 5 && predictedGrades.every((p) => p === receivedNorm);

    const newStatus = allMatch ? "verified" : "failed";
    const { error: updateErr } = await supabase
      .from("complaints")
      .update({
        image_verification: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", complaint_id);

    if (updateErr) {
      return res.status(500).json({ success: false, message: updateErr.message });
    }

    if (allMatch) {
      return res.status(200).json({
        success: true,
        message: "ok",
        image_verification: "verified",
        predicted_grades: predictedGrades,
        received_grade_normalized: receivedNorm,
      });
    }

    return res.status(200).json({
      success: true,
      message: "verification failed",
      image_verification: "failed",
      predicted_grades: predictedGrades,
      received_grade_normalized: receivedNorm,
    });
  } catch (err) {
    console.error("Admin verifyGrading error:", err);
    return res.status(500).json({ success: false, message: "Server error: " + err.message });
  }
};

/**
 * GET /api/admin/gradings/:orderId
 * Get all grading images, predictions, accuracy, and sequence for a specific order.
 * Admin can access any order (re-verification). Auth: admin.
 */
const getGradingsByOrder = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { orderId } = req.params;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    if (!orderId) {
      return res.status(400).json({ success: false, message: "orderId is required" });
    }

    const { data: gradings, error: gradingsError } = await supabase
      .from("gradings")
      .select("grading_id, job_id, order_id, created_at")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false });

    if (gradingsError) {
      console.error("Admin get gradings by order error:", gradingsError);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch gradings: " + gradingsError.message,
      });
    }

    if (!gradings || gradings.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No gradings found for this order",
        order_id: orderId,
        gradings: [],
      });
    }

    const gradingIds = gradings.map((g) => g.grading_id);
    const { data: gradingImages, error: imagesError } = await supabase
      .from("grading_images")
      .select("id, grading_id, image_base64, predicted_grade, accuracy, sequence, created_at")
      .in("grading_id", gradingIds)
      .order("grading_id", { ascending: true })
      .order("sequence", { ascending: true });

    if (imagesError) {
      console.error("Admin get grading images error:", imagesError);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch grading images: " + imagesError.message,
      });
    }

    const gradingsWithImages = gradings.map((grading) => {
      const images = (gradingImages || []).filter((img) => img.grading_id === grading.grading_id);
      return {
        grading_id: grading.grading_id,
        job_id: grading.job_id,
        order_id: grading.order_id,
        created_at: grading.created_at,
        images: images.map((img) => ({
          id: img.id,
          image_base64: img.image_base64,
          predicted_grade: img.predicted_grade,
          accuracy: img.accuracy,
          sequence: img.sequence,
          created_at: img.created_at,
        })),
        images_count: images.length,
      };
    });

    return res.status(200).json({
      success: true,
      message: "Gradings retrieved successfully",
      order_id: orderId,
      gradings: gradingsWithImages,
      total_gradings: gradingsWithImages.length,
    });
  } catch (err) {
    console.error("Admin getGradingsByOrder error:", err);
    return res.status(500).json({ success: false, message: "Server error: " + err.message });
  }
};

/**
 * GET /api/admin/gradings
 * Get all gradings across all orders (admin re-verification). Auth: admin.
 */
const getAllGradings = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { data: gradings, error: gradingsError } = await supabase
      .from("gradings")
      .select("grading_id, job_id, order_id, created_at")
      .order("created_at", { ascending: false });

    if (gradingsError) {
      console.error("Admin get all gradings error:", gradingsError);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch gradings: " + gradingsError.message,
      });
    }

    if (!gradings || gradings.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No gradings found",
        gradings: [],
      });
    }

    const gradingIds = gradings.map((g) => g.grading_id);
    const { data: gradingImages, error: imagesError } = await supabase
      .from("grading_images")
      .select("id, grading_id, image_base64, predicted_grade, accuracy, sequence, created_at")
      .in("grading_id", gradingIds)
      .order("grading_id", { ascending: true })
      .order("sequence", { ascending: true });

    if (imagesError) {
      console.error("Admin get grading images error:", imagesError);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch grading images: " + imagesError.message,
      });
    }

    const gradingsWithImages = gradings.map((grading) => {
      const images = (gradingImages || []).filter((img) => img.grading_id === grading.grading_id);
      return {
        grading_id: grading.grading_id,
        job_id: grading.job_id,
        order_id: grading.order_id,
        created_at: grading.created_at,
        images: images.map((img) => ({
          id: img.id,
          image_base64: img.image_base64,
          predicted_grade: img.predicted_grade,
          accuracy: img.accuracy,
          sequence: img.sequence,
          created_at: img.created_at,
        })),
        images_count: images.length,
      };
    });

    return res.status(200).json({
      success: true,
      message: "Gradings retrieved successfully",
      gradings: gradingsWithImages,
      total_gradings: gradingsWithImages.length,
    });
  } catch (err) {
    console.error("Admin getAllGradings error:", err);
    return res.status(500).json({ success: false, message: "Server error: " + err.message });
  }
};

module.exports = { verifyGrading, getGradingsByOrder, getAllGradings };
