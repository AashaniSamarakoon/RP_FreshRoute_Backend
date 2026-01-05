const { supabase } = require("../supabaseClient");

const submitPredictStock = async (req, res) => {
  try {
    const userId = req.user && req.user.id;
    if (!userId)
      return res.status(401).json({ message: "Unauthorized: user id missing" });

    const { fruit_type, variant, quantity, grade, estimated_harvest_date } =
      req.body;

    if (typeof fruit_type !== "string" || typeof variant !== "string") {
      return res
        .status(400)
        .json({ message: "Fruit Type and Variant must be strings" });
    }

    if (!Number.isInteger(quantity) || quantity <= 0) {
      return res
        .status(400)
        .json({ message: "quantity must be a positive integer" });
    }

    if (!grade || !["A", "B", "C"].includes(grade)) {
      return res.status(400).json({ message: "grade must be one of: A, B, C" });
    }

    if (!estimated_harvest_date) {
      return res
        .status(400)
        .json({ message: "estimated_harvest_date is required" });
    }

    // Fetch the farmer's ID from the farmer table using the authenticated user's ID
    const { data: farmerData, error: farmerError } = await supabase
      .from('farmer')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (farmerError) {
      console.error('Error fetching farmer:', farmerError);
      return res.status(500).json({ message: 'Failed to find associated farmer.', error: farmerError.message });
    }
    if (!farmerData) {
      return res.status(404).json({ message: 'No farmer profile found for the current user.' });
    }

    const farmerId = farmerData.id;

    const { data, error } = await supabase
      .from("estimated_stock")
      .insert([
        {
          farmer_id: farmerId,
          fruit_type,
          variant,
          quantity,
          grade,
          estimated_harvest_date,
        },
      ])
      .select("*")
      .single();

    if (error) {
      console.error("Supabase insert error:", error);
      return res.status(500).json({
        message: "Failed to submit predict stock",
        error: error.message,
      });
    }

    return res.status(201).json({ predictStock: data });
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ message: "Failed to submit predict stock", error: err.message });
  }
};

module.exports = { submitPredictStock };