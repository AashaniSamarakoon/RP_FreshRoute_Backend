// Script to manually trigger FreshRoute price update
require("dotenv").config();
const { updateFreshRoutePricesOnEconomicChange } = require("../Services/farmer/freshRoutePriceUpdater");
const { supabase } = require("../utils/supabaseClient");

async function updateFreshRoutePrices() {
  try {
    console.log("🚀 Manually triggering FreshRoute price update for all fruits...\n");
    
    // Get all fruits
    const { data: fruits, error: fruitErr } = await supabase
      .from("fruits")
      .select("id, name");

    if (fruitErr) throw fruitErr;

    console.log(`📦 Found ${fruits.length} fruits in database\n`);

    const results = [];
    for (const fruit of fruits) {
      console.log(`\n🔄 Processing ${fruit.name}...`);
      try {
        const result = await updateFreshRoutePricesOnEconomicChange(fruit.id, fruit.name);
        results.push({ fruit: fruit.name, ...result });
        console.log(`   ✅ ${fruit.name}: Archived ${result.archived}, Created ${result.created}`);
      } catch (err) {
        console.error(`   ❌ ${fruit.name}: ${err.message}`);
        results.push({ fruit: fruit.name, error: err.message });
      }
    }

    console.log("\n\n📊 Summary:");
    console.log("=" .repeat(50));
    
    const successful = results.filter(r => !r.error);
    const failed = results.filter(r => r.error);
    
    console.log(`\n✅ Successful: ${successful.length}`);
    successful.forEach(r => {
      console.log(`   • ${r.fruit}: Created ${r.created} prices`);
    });

    if (failed.length > 0) {
      console.log(`\n❌ Failed: ${failed.length}`);
      failed.forEach(r => {
        console.log(`   • ${r.fruit}: ${r.error}`);
      });
    }

    process.exit(0);
  } catch (err) {
    console.error("\n❌ Error:", err.message);
    process.exit(1);
  }
}

updateFreshRoutePrices();
