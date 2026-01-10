const { supabase } = require("../../utils/supabaseClient");

const getFruits = async (req, res) => {
  try {
    console.log("[getFruits] Fetching fruits from database...");

    const { data, error } = await supabase
      .from("fruits")
      .select("id, name, variety")
      .order("name", { ascending: true });

    console.log("[getFruits] Response from DB:", JSON.stringify(data, null, 2));
    console.log("[getFruits] Total fruits fetched:", data?.length || 0);

    if (error) {
      console.error("[getFruits] Supabase error:", error);
      return res
        .status(500)
        .json({ message: "Failed to fetch fruits", error: error.message });
    }

    return res.json({ fruits: data });
  } catch (err) {
    console.error("[getFruits] Exception:", err);
    return res
      .status(500)
      .json({ message: "Failed to fetch fruits", error: err.message });
  }
};

module.exports = { getFruits };
