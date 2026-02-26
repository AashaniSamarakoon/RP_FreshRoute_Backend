// Script to manually insert Dambulla prices
require("dotenv").config();
const { supabase } = require("../utils/supabaseClient");

const ECONOMIC_CENTER = "Dambulla Dedicated Economic Centre";

async function insertDambullaPrices() {
  try {
    console.log("🚀 Inserting Dambulla prices...");
    
    // Get fruit IDs
    const { data: fruits, error: fruitErr } = await supabase
      .from("fruits")
      .select("id, name")
      .in("name", ["Mango", "Banana", "Pineapple"]);

    if (fruitErr) throw fruitErr;

    const fruitMap = Object.fromEntries(fruits.map(f => [f.name, f.id]));
    console.log("📦 Found fruits:", fruitMap);

    // Current timestamp for today at 6 AM UTC
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    const capturedAt = new Date(`${y}-${m}-${d}T06:00:00.000Z`).toISOString();
    
    const prices = [
      {
        economic_center: ECONOMIC_CENTER,
        fruit_id: fruitMap["Mango"],
        fruit_name: "Mango",
        variety: "TJC",
        min_price: 360,
        max_price: 370,
        unit: "kg",
        currency: "LKR",
        source_url: "https://dambulladec.com/home-dailyprice (manual entry)",
        captured_at: capturedAt,
      },
      {
        economic_center: ECONOMIC_CENTER,
        fruit_id: fruitMap["Banana"],
        fruit_name: "Banana",
        variety: "Ambun",
        min_price: 250,
        max_price: 260,
        unit: "kg",
        currency: "LKR",
        source_url: "https://dambulladec.com/home-dailyprice (manual entry)",
        captured_at: capturedAt,
      },
      {
        economic_center: ECONOMIC_CENTER,
        fruit_id: fruitMap["Pineapple"],
        fruit_name: "Pineapple",
        variety: null,
        min_price: 340,
        max_price: 350,
        unit: "kg",
        currency: "LKR",
        source_url: "https://dambulladec.com/home-dailyprice (manual entry)",
        captured_at: capturedAt,
      },
    ];

    // Delete existing entries for today to avoid duplicates
    const todayDate = capturedAt.slice(0, 10);
    console.log(`🗑️  Removing existing entries for ${todayDate}...`);
    
    const { error: deleteErr } = await supabase
      .from("economic_center_prices")
      .delete()
      .eq("economic_center", ECONOMIC_CENTER)
      .gte("captured_at", `${todayDate}T00:00:00.000Z`)
      .lt("captured_at", `${todayDate}T23:59:59.999Z`);

    if (deleteErr) console.warn("⚠️  Delete warning:", deleteErr.message);

    // Insert new prices
    console.log("💾 Inserting prices...");
    const { data, error: insertErr } = await supabase
      .from("economic_center_prices")
      .insert(prices)
      .select();

    if (insertErr) throw insertErr;

    console.log("\n✅ Successfully inserted prices:");
    prices.forEach(p => {
      const variety = p.variety ? ` (${p.variety})` : '';
      console.log(`   • ${p.fruit_name}${variety}: Rs. ${p.min_price} - Rs. ${p.max_price}`);
    });

    console.log(`\n📊 Total records: ${data.length}`);
    console.log(`📅 Captured at: ${capturedAt}`);

    process.exit(0);
  } catch (err) {
    console.error("\n❌ Error:", err.message);
    console.error(err);
    process.exit(1);
  }
}

insertDambullaPrices();
