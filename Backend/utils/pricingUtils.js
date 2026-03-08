const { supabaseAdmin } = require("./supabaseClient");

/**
 * Fetches the unit price (LKR/kg) from freshroute_prices for a given
 * fruit/variant/grade/date combination. Returns null when no row is found.
 */
async function fetchUnitPrice(fruit, variant, grade, date) {
  const { data, error } = await supabaseAdmin
    .from("freshroute_prices")
    .select("price")
    .eq("fruit_name", fruit)
    .eq("variety", variant)
    .eq("grade", grade)
    .eq("target_date", date)
    .limit(1)
    .single();
  if (error && error.code !== "PGRST116") throw error;
  return data ? data.price : null;
}

/**
 * Calculates the price breakdown for an order given a unit price.
 * @param {{ quantity: number, distance_km?: number }} order
 * @param {number|null} unitPrice  LKR per kg
 */
function calculatePrice(order, unitPrice) {
  const basePrice = unitPrice != null ? unitPrice * order.quantity : null;
  const serviceCharge = basePrice != null ? basePrice * 0.01 : null;
  const distanceKm = order.distance_km || 0;
  const deliveryFee = distanceKm * 35;
  const totalPrice =
    basePrice != null ? basePrice + (serviceCharge || 0) + deliveryFee : null;
  return { unitPrice, basePrice, serviceCharge, deliveryFee, totalPrice };
}

/**
 * Calculates the price breakdown shown to the FARMER.
 * - No delivery fee (transport cost is not the farmer's concern)
 * - 1.4% platform service fee deducted from gross earnings
 * - farmerEarning = grossEarning - platformFee  (what farmer actually receives)
 *
 * @param {{ quantity: number }} order
 * @param {number|null} unitPrice  LKR per kg
 */
function calculateFarmerPrice(order, unitPrice) {
  const grossEarning = unitPrice != null ? unitPrice * order.quantity : null;
  const platformFee  = grossEarning != null ? grossEarning * 0.014 : null;
  const farmerEarning =
    grossEarning != null ? grossEarning - platformFee : null;
  return { unitPrice, grossEarning, platformFee, farmerEarning };
}

module.exports = { fetchUnitPrice, calculatePrice, calculateFarmerPrice };

