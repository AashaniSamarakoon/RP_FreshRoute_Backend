const { supabase } = require("../supabaseClient");

const placeOrder = async (req, res) => {
  try {
    const userId = req.user && req.user.id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized: user id missing" });
    }

    // Fetch the buyer's ID from the buyers table using the authenticated user's ID
    const { data: buyerData, error: buyerError } = await supabase
      .from('buyers')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (buyerError) {
      console.error('Error fetching buyer:', buyerError);
      // The error when no rows are found is expected in some cases, handle it gracefully.
      if (buyerError.code === 'PGRST116') {
        return res.status(404).json({ message: 'No buyer profile found for the current user.' });
      }
      return res.status(500).json({ message: 'Failed to find associated buyer.', error: buyerError.message });
    }
    if (!buyerData) {
      return res.status(404).json({ message: 'No buyer profile found for the current user.' });
    }

    const buyerId = buyerData.id;

    const { 
      fruit_type, 
      variant, 
      quantity, 
      grade, 
      required_date,
      delivery_location,
      latitude,
      longitude
    } = req.body;

    // --- Validations ---
    if (!fruit_type || typeof fruit_type !== "string") {
      return res.status(400).json({ message: "fruit_type is required and must be a string" });
    }
    if (!variant || typeof variant !== "string") {
        return res.status(400).json({ message: "variant is required and must be a string" });
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return res.status(400).json({ message: "quantity must be a positive integer" });
    }
    if (!grade || !["A", "B", "C"].includes(grade)) {
      return res.status(400).json({ message: "grade must be one of: A, B, C" });
    }
    if (!required_date) {
      return res.status(400).json({ message: "required_date is required" });
    }

    const orderData = {
      buyer_id: buyerId,
      fruit_type,
      variant,
      quantity,
      grade,
      required_date,
      delivery_location,
      latitude,
      longitude
    };

    const { data, error } = await supabase
      .from("placed_orders")
      .insert([orderData])
      .select("*")
      .single();

    if (error) {
      console.error("Supabase insert error:", error);
      return res.status(500).json({
        message: "Failed to place order",
        error: error.message,
      });
    }

    return res.status(201).json({ order: data });
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ message: "Failed to place order", error: err.message });
  }
};

module.exports = { placeOrder };
