const { supabase } = require("../../supabaseClient");

/**
 * Get farmer's SMS preferences
 */
async function getSMSPreferences(req, res) {
  try {
    const { data, error } = await supabase
      .from("users")
      .select("id, phone, sms_alerts_enabled, sms_frequency")
      .eq("id", req.user.id)
      .single();

    if (error) {
      console.error("SMS preferences fetch error", error);
      return res.status(500).json({ message: "Failed to fetch SMS preferences" });
    }

    res.json({ preferences: data });
  } catch (err) {
    console.error("SMS preferences server error", err);
    res.status(500).json({ message: "Server error" });
  }
}

/**
 * Update farmer's SMS preferences
 */
async function updateSMSPreferences(req, res) {
  try {
    const { phone, sms_alerts_enabled, sms_frequency } = req.body;

    const updates = {};
    if (phone !== undefined) updates.phone = phone;
    if (sms_alerts_enabled !== undefined) updates.sms_alerts_enabled = sms_alerts_enabled;
    if (sms_frequency !== undefined) updates.sms_frequency = sms_frequency;

    if (!Object.keys(updates).length) {
      return res.status(400).json({ message: "No updates provided" });
    }

    const { data, error } = await supabase
      .from("users")
      .update(updates)
      .eq("id", req.user.id)
      .select("id, phone, sms_alerts_enabled, sms_frequency")
      .single();

    if (error) {
      console.error("SMS preferences update error", error);
      return res.status(500).json({ message: "Failed to update SMS preferences" });
    }

    res.json({ message: "SMS preferences updated", preferences: data });
  } catch (err) {
    console.error("SMS preferences update server error", err);
    res.status(500).json({ message: "Server error" });
  }
}

module.exports = { getSMSPreferences, updateSMSPreferences };
