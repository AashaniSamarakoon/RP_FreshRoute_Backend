const { supabase } = require("../../utils/supabaseClient");

const getFruits = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("fruits")
      .select("id, name, variety")
      .order("name", { ascending: true });

    if (error) {
      return res
        .status(500)
        .json({ message: "Failed to fetch fruits", error: error.message });
    }

    return res.json({ fruits: data });
  } catch (err) {
    return res
      .status(500)
      .json({ message: "Failed to fetch fruits", error: err.message });
  }
};

module.exports = { getFruits };
