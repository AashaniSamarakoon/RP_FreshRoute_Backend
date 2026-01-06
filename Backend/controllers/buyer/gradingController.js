const { supabase } = require("../../utils/supabaseClient");

/**
 * GET /api/buyer/gradings/:orderId
 * Get all grading images, predictions, accuracy, and sequence for a specific order
 * Only accessible by the buyer who owns the order
 */
const getGradingsByOrder = async (req, res) => {
  try {
    const userId = req.user && req.user.id;
    if (!userId) {
      return res.status(401).json({ 
        success: false,
        message: "Unauthorized" 
      });
    }

    const { orderId } = req.params;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "orderId is required",
      });
    }

    // 1. Verify buyer exists
    const { data: buyerData, error: buyerError } = await supabase
      .from("buyers")
      .select("id")
      .eq("user_id", userId)
      .single();

    if (buyerError || !buyerData) {
      return res.status(404).json({
        success: false,
        message: "Buyer profile not found",
      });
    }

    // 2. Verify the order belongs to this buyer
    const { data: order, error: orderError } = await supabase
      .from("placed_orders")
      .select("id, buyer_id")
      .eq("id", orderId)
      .eq("buyer_id", buyerData.id)
      .single();

    if (orderError || !order) {
      return res.status(404).json({
        success: false,
        message: "Order not found or access denied",
      });
    }

    // 3. Get all gradings for this order
    const { data: gradings, error: gradingsError } = await supabase
      .from("gradings")
      .select("grading_id, job_id, order_id, created_at")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false });

    if (gradingsError) {
      console.error("Error fetching gradings:", gradingsError);
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

    // 4. Get all grading images for all gradings
    const gradingIds = gradings.map((g) => g.grading_id);

    const { data: gradingImages, error: imagesError } = await supabase
      .from("grading_images")
      .select("id, grading_id, image_base64, predicted_grade, accuracy, sequence, created_at")
      .in("grading_id", gradingIds)
      .order("grading_id", { ascending: true })
      .order("sequence", { ascending: true });

    if (imagesError) {
      console.error("Error fetching grading images:", imagesError);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch grading images: " + imagesError.message,
      });
    }

    // 5. Group images by grading_id
    const gradingsWithImages = gradings.map((grading) => {
      const images = (gradingImages || []).filter(
        (img) => img.grading_id === grading.grading_id
      );

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
    console.error("GetGradingsByOrder Error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error: " + err.message,
    });
  }
};

/**
 * GET /api/buyer/gradings
 * Get all gradings for all orders belonging to the buyer
 */
const getAllGradings = async (req, res) => {
  try {
    const userId = req.user && req.user.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    // 1. Verify buyer exists and get buyer ID
    const { data: buyerData, error: buyerError } = await supabase
      .from("buyers")
      .select("id")
      .eq("user_id", userId)
      .single();

    if (buyerError || !buyerData) {
      return res.status(404).json({
        success: false,
        message: "Buyer profile not found",
      });
    }

    // 2. Get all orders for this buyer
    const { data: orders, error: ordersError } = await supabase
      .from("placed_orders")
      .select("id")
      .eq("buyer_id", buyerData.id);

    if (ordersError) {
      console.error("Error fetching orders:", ordersError);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch orders: " + ordersError.message,
      });
    }

    if (!orders || orders.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No orders found",
        gradings: [],
      });
    }

    const orderIds = orders.map((o) => o.id);

    // 3. Get all gradings for these orders
    const { data: gradings, error: gradingsError } = await supabase
      .from("gradings")
      .select("grading_id, job_id, order_id, created_at")
      .in("order_id", orderIds)
      .order("created_at", { ascending: false });

    if (gradingsError) {
      console.error("Error fetching gradings:", gradingsError);
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

    // 4. Get all grading images
    const gradingIds = gradings.map((g) => g.grading_id);

    const { data: gradingImages, error: imagesError } = await supabase
      .from("grading_images")
      .select("id, grading_id, image_base64, predicted_grade, accuracy, sequence, created_at")
      .in("grading_id", gradingIds)
      .order("grading_id", { ascending: true })
      .order("sequence", { ascending: true });

    if (imagesError) {
      console.error("Error fetching grading images:", imagesError);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch grading images: " + imagesError.message,
      });
    }

    // 5. Group images by grading_id
    const gradingsWithImages = gradings.map((grading) => {
      const images = (gradingImages || []).filter(
        (img) => img.grading_id === grading.grading_id
      );

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
    console.error("GetAllGradings Error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error: " + err.message,
    });
  }
};

module.exports = { getGradingsByOrder, getAllGradings };

