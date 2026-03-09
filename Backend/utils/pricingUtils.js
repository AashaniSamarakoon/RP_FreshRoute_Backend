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
 * This is the BUYER view, so it includes:
 *   - platform service fee (2% of base price)
 *   - delivery fee based on distance
 *
 * @param {{ quantity: number, distance_km?: number }} order
 * @param {number|null} unitPrice  LKR per kg
 * @param {{platformFeeRate?:number, deliveryRatePerKm?:number}} [options] optional overrides for fee rates
 * @returns {{unitPrice:number|null, basePrice:number|null, serviceCharge:number|null, platformFeeRate:number, deliveryFee:number, totalPrice:number|null}}
 */
function calculatePrice(order, unitPrice, options = {}) {
  const basePrice = unitPrice != null ? unitPrice * order.quantity : null;
  // allow callers to override the platform fee rate (default buyer 2%)
  const platformFeeRate = options.platformFeeRate != null ? options.platformFeeRate : 0.02; // buyers pay 2% platform fee
  const serviceCharge = basePrice != null ? basePrice * platformFeeRate : null;
  const distanceKm = order.distance_km || 0;
  // delivery rate could be adjusted (default 35 LKR/km)
  const deliveryRatePerKm = options.deliveryRatePerKm || 35;
  const deliveryFee = distanceKm * deliveryRatePerKm;
  const totalPrice =
    basePrice != null ? basePrice + (serviceCharge || 0) + deliveryFee : null;
  return { unitPrice, basePrice, serviceCharge, platformFeeRate, deliveryFee, totalPrice };
}

/**
 * Calculates the price breakdown shown to the FARMER.
 * - No delivery fee (transport cost is not the farmer's concern)
 * - 1.4% platform service fee deducted from gross earnings by default
 * - farmerEarning = grossEarning - platformFee  (what farmer actually receives)
 *
 * @param {{ quantity: number }} order
 * @param {number|null} unitPrice  LKR per kg
 * @param {{platformFeeRate?:number}} [options] optional overrides (e.g. promotional rate)
 * @returns {{unitPrice:number|null, grossEarning:number|null, platformFee:number|null, platformFeeRate:number, farmerEarning:number|null}}
 */
function calculateFarmerPrice(order, unitPrice, options = {}) {
  // reuse calculatePrice to avoid duplication; force deliveryRatePerKm=0
  const defaultRate = 0.014;
  const platformFeeRate = options.platformFeeRate != null ? options.platformFeeRate : defaultRate;

  const buyerView = calculatePrice(order, unitPrice, { platformFeeRate, deliveryRatePerKm: 0 });
  const grossEarning = buyerView.basePrice;
  const platformFee = buyerView.serviceCharge;
  const farmerEarning = grossEarning != null ? grossEarning - platformFee : null;

  return { unitPrice, grossEarning, platformFee, platformFeeRate, farmerEarning };
}

module.exports = { fetchUnitPrice, calculatePrice, calculateFarmerPrice };

