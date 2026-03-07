#!/usr/bin/env node
/**
 * Debug SMS alerts - check what's actually in the users table
 */

const { supabase } = require("../utils/supabaseClient");

async function debugSMSAlerts() {
  try {
    console.log("🔍 Checking all farmers in database...\n");

    // Get all farmers
    const { data: allFarmers, error: err1 } = await supabase
      .from("users")
      .select("id, first_name, last_name, role, phone, sms_alerts_enabled, sms_frequency")
      .eq("role", "farmer");

    if (err1) {
      console.error("Error querying farmers:", err1);
      return;
    }

    console.log(`Total farmers: ${allFarmers?.length || 0}\n`);

    if (allFarmers && allFarmers.length > 0) {
      console.log("Farmer Details:");
      allFarmers.forEach((f, idx) => {
        console.log(`\n[${idx + 1}] ${f.first_name} ${f.last_name}`);
        console.log(`    ID: ${f.id}`);
        console.log(`    Phone: ${f.phone}`);
        console.log(`    SMS Alerts: ${f.sms_alerts_enabled} (type: ${typeof f.sms_alerts_enabled})`);
        console.log(`    SMS Frequency: ${f.sms_frequency}`);
      });
    }

    console.log("\n\n📱 Checking farmers with SMS alerts = true...");
    const { data: enabledFarmers, error: err2 } = await supabase
      .from("users")
      .select("id, first_name, last_name, phone, sms_alerts_enabled")
      .eq("role", "farmer")
      .eq("sms_alerts_enabled", true);

    if (err2) {
      console.error("Error querying with sms_alerts_enabled=true:", err2);
    } else {
      console.log(`Found ${enabledFarmers?.length || 0} farmers with SMS enabled (true)`);
      if (enabledFarmers && enabledFarmers.length > 0) {
        enabledFarmers.forEach(f => {
          console.log(`  ✓ ${f.first_name} ${f.last_name}: ${f.phone}`);
        });
      }
    }

    console.log("\n\n📱 Checking farmers with SMS alerts = 'true' (string)...");
    const { data: enabledFarmersStr, error: err3 } = await supabase
      .from("users")
      .select("id, first_name, last_name, phone, sms_alerts_enabled")
      .eq("role", "farmer")
      .eq("sms_alerts_enabled", "true");

    if (err3) {
      console.log(`No results with string 'true': ${err3.message}`);
    } else {
      console.log(`Found ${enabledFarmersStr?.length || 0} farmers with SMS enabled (string 'true')`);
    }

    console.log("\n\n🔧 Verifying table schema...");
    const { data: columns, error: err4 } = await supabase
      .from("information_schema.columns")
      .select("column_name, data_type")
      .eq("table_name", "users")
      .eq("column_name", "sms_alerts_enabled");

    if (err4) {
      console.log("Could not query schema:", err4.message);
    } else if (columns && columns.length > 0) {
      console.log(`Column 'sms_alerts_enabled' data type: ${columns[0].data_type}`);
    }

  } catch (err) {
    console.error("Debug error:", err);
  }

  process.exit(0);
}

debugSMSAlerts();
