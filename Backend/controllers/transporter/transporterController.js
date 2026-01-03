const { supabase } = require("../../supabaseClient");

const getCollectionJobs = async (req, res) => {
  try {
    // Access transporter_id from the decoded token (from the middleware)
    const transporterId = req.user.id;

    if (!transporterId) {
      return res
        .status(400)
        .json({ message: "Invalid token: transporter_id not found" });
    }

    // Query the database to get the collection jobs for the transporter
    const { data, error } = await supabase
      .from("collection_jobs")
      .select("*")
      .eq("transporter_id", transporterId) // Filter by transporter_id
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      return res.status(500).json({
        message: "Failed to fetch collection jobs",
        error: error.message,
      });
    }

    // Return the collection jobs in the response
    return res.json({ todayJobs: data });
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ message: "Server error", error: err.message });
  }
};

module.exports = { getCollectionJobs };
