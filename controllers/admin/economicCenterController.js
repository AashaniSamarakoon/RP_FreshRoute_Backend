// controllers/admin/economicCenterController.js
const { supabase } = require("../../supabaseClient");
const { importDambullaPrices } = require("../../services/dambullaScraper");

async function importEconomicCenterPrices(req, res) {
  try {
    const { source } = req.body;

    if (!source || !["dambulla"].includes(source)) {
      return res.status(400).json({ message: "Invalid source. Supported: dambulla" });
    }

    if (source === "dambulla") {
      const result = await importDambullaPrices();
      return res.json({
        message: "Import successful",
        jobId: result.jobId,
        recordsImported: result.recordsImported,
      });
    }
  } catch (err) {
    console.error("Import error:", err);
    res.status(500).json({
      message: "Failed to import prices",
      error: err.message,
    });
  }
}

async function getEconomicCenterPrices(req, res) {
  try {
    const { center, date, fruit_id } = req.query;

    if (!center) {
      return res.status(400).json({ message: "center parameter is required" });
    }

    let query = supabase
      .from("economic_center_prices")
      .select("*, fruits(name, variety, image_url)")
      .eq("economic_center", center);

    if (date) {
      const dateOnly = date.split("T")[0]; // Extract YYYY-MM-DD
      query = query.eq("captured_at::date", dateOnly);
    } else {
      // Default to today's date
      const today = new Date().toISOString().split("T")[0];
      query = query.eq("captured_at::date", today);
    }

    if (fruit_id) {
      query = query.eq("fruit_id", fruit_id);
    }

    const { data, error } = await query.order("captured_at", { ascending: false });

    if (error) {
      console.error("Fetch error:", error);
      return res.status(500).json({ message: "Failed to fetch prices" });
    }

    res.json({
      center,
      date: date || new Date().toISOString().split("T")[0],
      prices: data || [],
    });
  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({ message: "Server error" });
  }
}

async function getScrapingJobStatus(req, res) {
  try {
    const { jobId } = req.params;

    const { data, error } = await supabase
      .from("scraping_jobs")
      .select("*")
      .eq("id", jobId)
      .single();

    if (error) {
      return res.status(404).json({ message: "Job not found" });
    }

    res.json(data);
  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({ message: "Server error" });
  }
}

module.exports = {
  importEconomicCenterPrices,
  getEconomicCenterPrices,
  getScrapingJobStatus,
};
