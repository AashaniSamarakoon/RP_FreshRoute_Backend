#!/usr/bin/env node
/**
 * Debug - check ALL users in database
 */

const { supabase } = require("../utils/supabaseClient");

async function debugAllUsers() {
  try {
    console.log("🔍 Checking ALL users in database...\n");

    // Get all users
    const { data: allUsers, error: err } = await supabase
      .from("users")
      .select("id, first_name, last_name, role, phone, sms_alerts_enabled, is_onboarded");

    if (err) {
      console.error("Error querying users:", err);
      return;
    }

    console.log(`Total users: ${allUsers?.length || 0}\n`);

    if (allUsers && allUsers.length > 0) {
      console.log("User Details:");
      allUsers.forEach((u, idx) => {
        console.log(`\n[${idx + 1}] ${u.first_name} ${u.last_name}`);
        console.log(`    Role: ${u.role}`);
        console.log(`    Phone: ${u.phone}`);
        console.log(`    SMS Alerts: ${u.sms_alerts_enabled}`);
        console.log(`    Onboarded: ${u.is_onboarded}`);
      });
    } else {
      console.log("❌ No users found in database!");
    }

  } catch (err) {
    console.error("Debug error:", err);
  }

  process.exit(0);
}

debugAllUsers();
