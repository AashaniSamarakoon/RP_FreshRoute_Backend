// Insert initial seed data for economic center prices
require("dotenv").config();
const { supabase } = require("../utils/supabaseClient");

async function insertInitialPrices() {
  try {
    console.log("🌱 Inserting initial economic center prices...\n");

    // Get fruit IDs
    const { data: fruits, error: fruitErr } = await supabase
      .from("fruits")
      .select("id, name")
      .in("name", ["Mango", "Banana", "Pineapple"]);

    if (fruitErr) throw fruitErr;

    const fruitMap = Object.fromEntries(fruits.map(f => [f.name, f.id]));

    // Today's timestamp
    const today = new Date();
    const capturedAt = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
      6,
      0,
      0
    ).toISOString();

    // Initial prices (example data - adjust as needed)
    const initialPrices = [
      {
        economic_center: "Dambulla Dedicated Economic Centre",
        fruit_id: fruitMap["Mango"],
        fruit_name: "Mango",
        variety: "TJC",
        min_price: 280,
        max_price: 320,
        unit: "kg",
        currency: "LKR",
        source_url: "https://dambulladec.com/home-dailyprice (manual seed)",
        captured_at: capturedAt,
      },
      {
        economic_center: "Dambulla Dedicated Economic Centre",
        fruit_id: fruitMap["Banana"],
        fruit_name: "Banana",
        variety: "Ambul",
        min_price: 120,
        max_price: 140,
        unit: "kg",
        currency: "LKR",
        source_url: "https://dambulladec.com/home-dailyprice (manual seed)",
        captured_at: capturedAt,
      },
      {
        economic_center: "Dambulla Dedicated Economic Centre",
        fruit_id: fruitMap["Pineapple"],
        fruit_name: "Pineapple",
        variety: "All",
        min_price: 220,
        max_price: 260,
        unit: "kg",
        currency: "LKR",
        source_url: "https://dambulladec.com/home-dailyprice (manual seed)",
        captured_at: capturedAt,
      },
    ];

    const { error: insertErr } = await supabase
      .from("economic_center_prices")
      .insert(initialPrices);

    if (insertErr) throw insertErr;

    console.log(`✅ Inserted ${initialPrices.length} initial prices\n`);
    
    initialPrices.forEach(p => {
      console.log(`   ${p.fruit_name} (${p.variety}): Rs. ${p.min_price}-${p.max_price}/${p.unit}`);
    });

    console.log("\n💡 Now run: npm start (backend will use these prices)");
    console.log("💡 Or run: node scripts/run-dambulla-scraper.js (to scrape live data)");
    
    process.exit(0);
  } catch (err) {
    console.error("❌ Error:", err.message);
    process.exit(1);
  }
}

insertInitialPrices();
