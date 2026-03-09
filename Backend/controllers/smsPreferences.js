const { supabase } = require("../utils/supabaseClient");

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

    // Ensure sms_alerts_enabled is returned as boolean
    const preferences = {
      ...data,
      sms_alerts_enabled: Boolean(data.sms_alerts_enabled)
    };

    res.json({ preferences });
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

    // Validate and normalize sms_alerts_enabled
    let normalized_sms_alerts_enabled = sms_alerts_enabled;
    if (sms_alerts_enabled !== undefined) {
      if (typeof sms_alerts_enabled === 'string') {
        // Handle string values like "true"/"false"
        if (sms_alerts_enabled === 'true') {
          normalized_sms_alerts_enabled = true;
        } else if (sms_alerts_enabled === 'false') {
          normalized_sms_alerts_enabled = false;
        } else {
          return res.status(400).json({
            message: "Invalid sms_alerts_enabled value. Must be a boolean or string 'true'/'false'."
          });
        }
      } else if (typeof sms_alerts_enabled !== 'boolean') {
        return res.status(400).json({
          message: "Invalid sms_alerts_enabled value. Must be a boolean or string 'true'/'false'."
        });
      }
    }

    // Validate sms_frequency if provided
    const validFrequencies = ['daily', 'weekly', 'never'];
    if (sms_frequency !== undefined && !validFrequencies.includes(sms_frequency)) {
      return res.status(400).json({
        message: `Invalid sms_frequency. Must be one of: ${validFrequencies.join(', ')}`
      });
    }

    console.log(`[SMS Update] User ${req.user.id} requesting update:`, {
      sms_alerts_enabled: sms_alerts_enabled,
      type: typeof sms_alerts_enabled,
      normalized: normalized_sms_alerts_enabled
    });

    const updates = {};
    if (phone !== undefined) updates.phone = phone;
    if (normalized_sms_alerts_enabled !== undefined) {
      updates.sms_alerts_enabled = Boolean(normalized_sms_alerts_enabled); // Ensure boolean type
    }
    if (sms_frequency !== undefined) updates.sms_frequency = sms_frequency;

    if (!Object.keys(updates).length) {
      return res.status(400).json({ message: "No updates provided" });
    }

    console.log(`[SMS Update] Final updates object:`, updates);

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

    console.log(`[SMS Update] Successfully updated SMS preferences for user ${req.user.id}:`, data);
    res.json({ message: "SMS preferences updated", preferences: data });
  } catch (err) {
    console.error("SMS preferences update server error", err);
    res.status(500).json({ message: "Server error" });
  }
}

module.exports = { getSMSPreferences, updateSMSPreferences };