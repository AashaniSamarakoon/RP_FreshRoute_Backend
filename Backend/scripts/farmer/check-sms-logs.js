// Script to check SMS logs in database
// Usage: node scripts/check-sms-logs.js

require("dotenv").config();
const { supabase } = require("../../supabaseClient");

async function checkSMSLogs() {
  try {
    console.log("📋 Fetching SMS logs from database...\n");

    const { data, error } = await supabase
      .from("sms_logs")
      .select("id, farmer_id, phone, status, error_message, sent_at")
      .order("sent_at", { ascending: false })
      .limit(20);

    if (error) {
      console.error("Failed to fetch logs:", error.message);
      process.exit(1);
    }

    if (!data || data.length === 0) {
      console.log("No SMS logs found.\n");
      console.log("Next steps:");
      console.log("1. Enable farmer SMS alerts: UPDATE users SET sms_alerts_enabled = true WHERE role = 'farmer';");
      console.log("2. Manually trigger SMS: node scripts/test-sms-send.js <phone>");
      console.log("3. Or wait for daily 6:00 AM trigger");
      process.exit(0);
    }

    console.log(`Found ${data.length} SMS logs:\n`);
    
    // Format for display
    const displayData = data.map(log => ({
      phone: log.phone,
      status: log.status,
      sent_at: new Date(log.sent_at).toLocaleString(),
      error: log.error_message || "None",
    }));

    console.table(displayData);

    // Summary
    const sent = data.filter(d => d.status === "sent").length;
    const failed = data.filter(d => d.status === "failed").length;
    const pending = data.filter(d => d.status === "pending").length;

    console.log(`\n📊 Summary:`);
    console.log(`  ✓ Sent: ${sent}`);
    console.log(`  ✗ Failed: ${failed}`);
    console.log(`  ⏳ Pending: ${pending}\n`);

    process.exit(0);
  } catch (err) {
    console.error("Error:", err.message);
    process.exit(1);
  }
}

checkSMSLogs();
