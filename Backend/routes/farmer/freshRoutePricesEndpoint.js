/**
 * Endpoint for FreshRoute Graded Prices
 * Returns price tiers (A, B, C, D) for each fruit for today
 */
const { supabase } = require("../../utils/supabaseClient");

async function getFreshRoutePrices(req, res) {
  try {
    const today = new Date().toISOString().split("T")[0];

    // Get all freshroute prices for today with all grades
    const { data: prices, error } = await supabase
      .from("freshroute_prices")
      .select("*")
      .eq("target_date", today);

    if (error) throw error;

    // Get fruit images for display
    const { data: fruitImages } = await supabase
      .from("fruits")
      .select("id, name, image_url");

    const imageMap = Object.fromEntries((fruitImages || []).map(f => [f.name, f.image_url]));

    // Group by fruit with all grades
    const fruitPrices = {};
    (prices || []).forEach(p => {
      if (!fruitPrices[p.fruit_id]) {
        fruitPrices[p.fruit_id] = {
          fruit_id: p.fruit_id,
          name: p.fruit_name,
          variety: p.variety,
          image: imageMap[p.fruit_name] || `https://via.placeholder.com/100?text=${p.fruit_name}`,
          economicCenterRange: {
            min: p.source_min_price,
            max: p.source_max_price,
          },
          grades: {},
          lastUpdated: p.updated_at,
        };
      }
      
      fruitPrices[p.fruit_id].grades[p.grade] = {
        grade: p.grade,
        price: p.price,
        description: getGradeDescription(p.grade),
      };
    });

    res.json({
      date: today,
      fruits: Object.values(fruitPrices),
      marginPercentage: 2,
    });
  } catch (err) {
    console.error("FreshRoute prices error", err);
    res.status(500).json({ message: "Failed to fetch FreshRoute prices" });
  }
}

function getGradeDescription(grade) {
  const descriptions = {
    'A': 'Premium Quality (Maximum Market Price + 2%)',
    'B': 'High Quality (High-Mid Market Price + 2%)',
    'C': 'Standard Quality (Low-Mid Market Price + 2%)',
    'D': 'Budget Quality (Minimum Market Price + 2%)',
  };
  return descriptions[grade] || 'Unknown';
}

module.exports = { getFreshRoutePrices };
