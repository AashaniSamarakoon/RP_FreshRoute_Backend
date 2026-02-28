// Script to check FreshRoute price status
require("dotenv").config();
const { supabase } = require("../utils/supabaseClient");

async function checkStatus() {
  try {
    const today = new Date().toISOString().split("T")[0];
    console.log("🔍 FreshRoute Price Status Check");
    console.log("=" .repeat(60));
    console.log(`📅 Date: ${today}\n`);

    // 1. Check economic center prices
    console.log("1️⃣ Economic Center Prices:");
    const { data: economicPrices, error: econErr } = await supabase
      .from("economic_center_prices")
      .select("fruit_name, min_price, max_price, variety, captured_at")
      .gte("captured_at", `${today}T00:00:00Z`)
      .order("fruit_name");

    if (econErr) {
      console.error("   ❌ Error:", econErr.message);
    } else if (!economicPrices || economicPrices.length === 0) {
      console.log("   ⚠️  No economic center prices found for today");
    } else {
      console.log(`   ✅ Found ${economicPrices.length} economic prices:`);
      economicPrices.forEach(p => {
        const variety = p.variety ? ` (${p.variety})` : '';
        console.log(`      • ${p.fruit_name}${variety}: Rs. ${p.min_price} - ${p.max_price}`);
      });
    }

    // 2. Check FreshRoute prices table
    console.log("\n2️⃣ FreshRoute Prices (freshroute_prices table):");
    const { data: freshPrices, error: freshErr } = await supabase
      .from("freshroute_prices")
      .select("fruit_name, grade, price, target_date")
      .eq("target_date", today)
      .order("fruit_name")
      .order("grade");

    if (freshErr) {
      console.error("   ❌ Error:", freshErr.message);
    } else if (!freshPrices || freshPrices.length === 0) {
      console.log("   ⚠️  No FreshRoute prices found for today");
    } else {
      console.log(`   ✅ Found ${freshPrices.length} FreshRoute price entries:`);
      
      // Group by fruit
      const byFruit = {};
      freshPrices.forEach(p => {
        if (!byFruit[p.fruit_name]) byFruit[p.fruit_name] = [];
        byFruit[p.fruit_name].push(p);
      });
      
      Object.entries(byFruit).forEach(([fruit, prices]) => {
        console.log(`      • ${fruit}:`);
        prices.forEach(p => {
          console.log(`        Grade ${p.grade}: Rs. ${p.price}`);
        });
      });
    }

    // 3. Check fruits table
    console.log("\n3️⃣ Fruits in database:");
    const { data: fruits, error: fruitsErr } = await supabase
      .from("fruits")
      .select("id, name")
      .order("name");

    if (fruitsErr) {
      console.error("   ❌ Error:", fruitsErr.message);
    } else {
      console.log(`   ✅ Found ${fruits.length} fruits:`);
      fruits.forEach(f => console.log(`      • ${f.name} (${f.id})`));
    }

    // 4. Summary & Recommendations
    console.log("\n" + "=" .repeat(60));
    console.log("📋 Summary:");
    
    if (economicPrices && economicPrices.length > 0) {
      if (!freshPrices || freshPrices.length === 0) {
        console.log("\n⚠️  ISSUE FOUND:");
        console.log("   • Economic center prices exist");
        console.log("   • But FreshRoute prices are missing");
        console.log("\n💡 Solution:");
        console.log("   Run: node scripts/update-freshroute-prices.js");
      } else {
        console.log("\n✅ All systems operational!");
        console.log(`   • ${economicPrices.length} economic prices`);
        console.log(`   • ${freshPrices.length} FreshRoute prices`);
      }
    } else {
      console.log("\n⚠️  No economic center prices for today");
      console.log("💡 Run: node scripts/insert-dambulla-prices.js");
    }

    console.log();
    process.exit(0);
  } catch (err) {
    console.error("\n❌ Error:", err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

checkStatus();
