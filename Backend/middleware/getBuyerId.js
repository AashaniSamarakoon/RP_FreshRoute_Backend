const { supabase } = require("../utils/supabaseClient");

/**
 * Middleware to fetch buyer_id from user_id (JWT token)
 * Attaches buyer_id to req.buyerId
 *
 * Requires: authMiddleware to run first (to populate req.user)
 *
 * @usage Apply this middleware after authMiddleware on buyer routes
 */
const getBuyerId = async (req, res, next) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        message: "Unauthorized: User ID not found in token",
      });
    }

    // Fetch buyer_id from buyers table using user_id from JWT
    const { data: buyerData, error } = await supabase
      .from("buyers")
      .select("id")
      .eq("user_id", userId)
      .single();

    if (error || !buyerData) {
      return res.status(404).json({
        message: "Buyer profile not found or not linked to this user",
      });
    }

    // Attach buyer_id to request object for use in controllers
    req.buyerId = buyerData.id;
    next();
  } catch (error) {
    console.error("getBuyerId middleware error:", error);
    res.status(500).json({
      message: "Failed to verify buyer account",
      error: error.message,
    });
  }
};

module.exports = { getBuyerId };
