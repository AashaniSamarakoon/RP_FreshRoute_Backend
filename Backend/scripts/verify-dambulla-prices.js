// Script to verify Dambulla prices in database
require("dotenv").config();
const { supabase } = require("../utils/supabaseClient");

const ECONOMIC_CENTER = "Dambulla Dedicated Economic Centre";

async function verifyPrices() {
  try {
    console.log("🔍 Checking prices in database...\n");
    
    const today = new Date().toISOString().slice(0, 10);
    
    const { data, error } = await supabase
      .from("economic_center_prices")
      .select("*")
      .eq("economic_center", ECONOMIC_CENTER)
      .gte("captured_at", `${today}T00:00:00.000Z`)
      .order("fruit_name", { ascending: true });

    if (error) throw error;

    if (!data || data.length === 0) {
      console.log("❌ No prices found for today");
    } else {
      console.log(`✅ Found ${data.length} price entries for today (${today}):\n`);
      
      data.forEach((item, index) => {
        const variety = item.variety ? ` (${item.variety})` : '';
        const avgPrice = (item.min_price + item.max_price) / 2;
        console.log(`${index + 1}. ${item.fruit_name}${variety}`);
        console.log(`   📊 Price Range: Rs. ${item.min_price} - Rs. ${item.max_price} (Avg: Rs. ${avgPrice})`);
        console.log(`   📦 Unit: ${item.unit}`);
        console.log(`   🏢 Economic Center: ${item.economic_center}`);
        console.log(`   🔗 Source: ${item.source_url}`);
        console.log(`   📅 Captured: ${new Date(item.captured_at).toLocaleString()}\n`);
      });
    }

    process.exit(0);
  } catch (err) {
    console.error("\n❌ Error:", err.message);
    process.exit(1);
  }
}

verifyPrices();
