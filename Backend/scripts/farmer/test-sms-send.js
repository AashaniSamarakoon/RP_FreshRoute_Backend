// Test script to manually send SMS to a farmer
// Usage: node scripts/test-sms-send.js <phone_number>

require("dotenv").config();
const { sendSMS, formatPhoneNumber } = require("../../Services/farmer/smsService");
const { supabase } = require("../../utils/supabaseClient");

async function testSMSSend() {
  const phoneArg = process.argv[2];
  
  if (!phoneArg) {
    console.log("Usage: node scripts/test-sms-send.js <phone_number>");
    console.log("Example: node scripts/test-sms-send.js 0703101244");
    console.log("Example: node scripts/test-sms-send.js +94703101244");
    process.exit(1);
  }

  const formattedPhone = formatPhoneNumber(phoneArg);
  console.log(`\n📱 Testing SMS service...`);
  console.log(`Input phone: ${phoneArg}`);
  console.log(`Formatted phone: ${formattedPhone}\n`);

  try {
    // Test message
    const testMessage = `🌱 FreshRoute Test Alert\n\nThis is a test message from FreshRoute backend.\n\nIf you received this, SMS alerts are working!\n\n✓ Check FreshRoute app for more details.`;

    console.log("Message to send:");
    console.log(testMessage);
    console.log("\n📤 Sending...\n");

    // Send SMS
    const result = await sendSMS(formattedPhone, testMessage);
    
    console.log(`✓ SMS sent successfully!`);
    console.log(`  SID: ${result.sid}`);
    console.log(`  Status: ${result.status}`);
    console.log(`  To: ${formattedPhone}\n`);

    // Log to database
    console.log("📝 Logging to sms_logs table...\n");
    
    const { error } = await supabase
      .from("sms_logs")
      .insert({
        farmer_id: null, // Test log
        phone: formattedPhone,
        status: "sent",
        error_message: null,
        sent_at: new Date().toISOString(),
        forecast_ids: [],
      });

    if (error) {
      console.error("⚠️ Failed to log SMS:", error.message);
    } else {
      console.log("✓ SMS logged to sms_logs table\n");
    }

    // Show recent logs
    console.log("📋 Recent SMS logs:\n");
    const { data: logs, error: logsErr } = await supabase
      .from("sms_logs")
      .select("*")
      .order("sent_at", { ascending: false })
      .limit(5);

    if (logsErr) {
      console.error("Failed to fetch logs:", logsErr.message);
    } else {
      console.table(logs);
    }

    process.exit(0);
  } catch (err) {
    console.error("✗ Error:", err.message);
    process.exit(1);
  }
}

testSMSSend();
