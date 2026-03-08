require("dotenv").config();
const {
  getDrivingDistanceKm,
  getRealWeather,
} = require("../../utils/logisticsUtils");
const { optimizeManifest } = require("../../utils/routeOptimizer");

// ==========================================
// 1. HARDCODED TEST DATA (Southern Province)
// ==========================================

const SP_CITIES = {
  galle: { lat: 6.0328, lng: 80.2168 },
  matara: { lat: 5.9549, lng: 80.555 },
  hambantota: { lat: 6.1248, lng: 81.1185 },
  tangalle: { lat: 6.024, lng: 80.7941 },
  weligama: { lat: 5.9736, lng: 80.4283 },
};

// Helper function to get city name from coordinates for better logs
function getCityName(lat, lng) {
  for (const [name, coords] of Object.entries(SP_CITIES)) {
    if (coords.lat === lat && coords.lng === lng) return name.toUpperCase();
  }
  return "UNKNOWN";
}

const MOCK_SPECS = {
  TJC: {
    variant_name: "TJC",
    optimal_temp_c: 13,
    max_safe_temp_c: 25,
    max_dist_uncooled_km: 50,
    force_refrigeration: false,
    ethylene_producer: false,
    ethylene_sensitive: true,
  },
  Ambul: {
    variant_name: "Ambul",
    optimal_temp_c: 14,
    max_safe_temp_c: 28,
    max_dist_uncooled_km: 60,
    force_refrigeration: false,
    ethylene_producer: true,
    ethylene_sensitive: false,
  },
  ALL: {
    variant_name: "ALL",
    optimal_temp_c: 10,
    max_safe_temp_c: 28,
    max_dist_uncooled_km: 150,
    force_refrigeration: false,
    ethylene_producer: false,
    ethylene_sensitive: false,
  },
};

const MOCK_FLEET = [
  {
    id: "TRK-REEF-1",
    vehicle_license_plate: "SP-REEF-001",
    vehicle_type: "REFRIGERATED",
    capacity_kg: 2000,
    current_lat: SP_CITIES.galle.lat,
    current_lng: SP_CITIES.galle.lng,
  },
  {
    id: "TRK-REEF-2",
    vehicle_license_plate: "SP-REEF-002",
    vehicle_type: "REFRIGERATED",
    capacity_kg: 2000,
    current_lat: SP_CITIES.galle.lat,
    current_lng: SP_CITIES.galle.lng,
  },
  {
    id: "TRK-COVR-1",
    vehicle_license_plate: "SP-COVR-001",
    vehicle_type: "COVERED",
    capacity_kg: 3000,
    current_lat: SP_CITIES.matara.lat,
    current_lng: SP_CITIES.matara.lng,
  },
  {
    id: "TRK-OPEN-1",
    vehicle_license_plate: "SP-OPEN-001",
    vehicle_type: "UNCOVERED",
    capacity_kg: 4000,
    current_lat: SP_CITIES.hambantota.lat,
    current_lng: SP_CITIES.hambantota.lng,
  },
];

const MOCK_ORDERS = [
  {
    id: "ORD-SPLIT",
    fruit_variant: "ALL",
    quantity: 4500,
    pickup_lat: SP_CITIES.hambantota.lat,
    pickup_lng: SP_CITIES.hambantota.lng,
    drop_lat: SP_CITIES.galle.lat,
    drop_lng: SP_CITIES.galle.lng,
  },
  {
    id: "ORD-MANGO",
    fruit_variant: "TJC",
    quantity: 500,
    pickup_lat: SP_CITIES.matara.lat,
    pickup_lng: SP_CITIES.matara.lng,
    drop_lat: SP_CITIES.galle.lat,
    drop_lng: SP_CITIES.galle.lng,
  },
  {
    id: "ORD-BANANA",
    fruit_variant: "Ambul",
    quantity: 800,
    pickup_lat: SP_CITIES.matara.lat,
    pickup_lng: SP_CITIES.matara.lng,
    drop_lat: SP_CITIES.galle.lat,
    drop_lng: SP_CITIES.galle.lng,
  },
  {
    id: "ORD-RAIN",
    fruit_variant: "ALL",
    quantity: 1000,
    pickup_lat: SP_CITIES.tangalle.lat,
    pickup_lng: SP_CITIES.tangalle.lng,
    drop_lat: SP_CITIES.weligama.lat,
    drop_lng: SP_CITIES.weligama.lng,
  },
];

// ==========================================
// 2. THE ALGORITHM SIMULATION
// ==========================================
async function runSimulation() {
  console.log("\n=======================================================");
  console.log("🚛 ADVANCED LOGISTICS ASSIGNMENT ENGINE SIMULATION");
  console.log("=======================================================\n");

  let fleetStatus = MOCK_FLEET.map((v) => ({
    ...v,
    remaining_capacity: v.capacity_kg,
    assigned_orders: [],
    has_ethylene_producer: false,
    has_ethylene_sensitive: false,
    is_reefer_on: false,
  }));

  const enrichedOrders = [];

  console.log("🔍 PHASE 1: Data Enrichment & Constraint Analysis");
  for (const order of MOCK_ORDERS) {
    const specs = MOCK_SPECS[order.fruit_variant];
    const pickupCity = getCityName(order.pickup_lat, order.pickup_lng);
    const dropCity = getCityName(order.drop_lat, order.drop_lng);

    console.log(
      `\n   📦 Evaluating Order: ${order.id} (${order.quantity}kg ${order.fruit_variant}) | Route: ${pickupCity} -> ${dropCity}`,
    );

    // Fetch live data
    const routing = await getDrivingDistanceKm(
      order.pickup_lat,
      order.pickup_lng,
      order.drop_lat,
      order.drop_lng,
    );
    const weather = await getRealWeather(order.pickup_lat, order.pickup_lng);

    // Log the actual API responses
    console.log(
      `      🚗 Distance API : ${routing.distanceKm} km (Est. ${routing.durationMins} mins) [Source: ${routing.via}]`,
    );
    console.log(
      `      🌤️  Weather API  : ${weather.temp_c}°C | Condition: ${weather.condition} | Raining: ${weather.raining}`,
    );

    let reqType = "UNCOVERED";
    let requiresCooling = false;
    let reason = "Optimal conditions";
    let strictnessScore = 1;

    // Decision Logic
    if (
      specs.force_refrigeration ||
      weather.temp_c > specs.max_safe_temp_c ||
      routing.distanceKm > specs.max_dist_uncooled_km
    ) {
      reqType = "REFRIGERATED";
      requiresCooling = true;
      strictnessScore = 3;
      reason = `Heat/Distance Limit (Max Temp: ${specs.max_safe_temp_c}C, Max Dist: ${specs.max_dist_uncooled_km}km)`;
    } else if (weather.raining) {
      reqType = "COVERED";
      requiresCooling = false;
      strictnessScore = 2;
      reason = "Rain Forecasted at Pickup";
    }

    console.log(`      ⚙️  Decision     : Needs [${reqType}] -> ${reason}`);

    enrichedOrders.push({
      ...order,
      _algo: {
        pLat: order.pickup_lat,
        pLng: order.pickup_lng,
        dLat: order.drop_lat,
        dLng: order.drop_lng,
        reqType,
        requiresCooling,
        reason,
        strictnessScore,
        specs,
      },
    });
  }

  console.log("\n📊 PHASE 2: FFD (First-Fit Decreasing) Prioritization");
  enrichedOrders.sort((a, b) => {
    // 1. Primary: Required Vehicle Strictness (Reefer=3, Covered=2, Uncovered=1)
    if (a._algo.strictnessScore !== b._algo.strictnessScore) {
      return b._algo.strictnessScore - a._algo.strictnessScore;
    }

    // 2. Tie-Breaker: Base Fruit Fragility (Lower safe temp = higher priority)
    if (a._algo.specs.max_safe_temp_c !== b._algo.specs.max_safe_temp_c) {
      return a._algo.specs.max_safe_temp_c - b._algo.specs.max_safe_temp_c;
    }

    // 3. Fallback: Largest quantity first (Bin packing optimization)
    return b.quantity - a.quantity;
  });
  console.log(
    `   -> Processing Order Sequence: ${enrichedOrders.map((o) => o.id).join(" -> ")}`,
  );

  console.log("\n🧠 PHASE 3: Bin Packing & Assignment Engine");
  for (const order of enrichedOrders) {
    let remainingQty = order.quantity;
    const { reqType, requiresCooling, specs } = order._algo;
    console.log(`\n   ▶ Allocating ${order.id} (${remainingQty}kg)...`);

    while (remainingQty > 0) {
      let bestVehicle = null;
      let bestScore = -Infinity;

      for (let v of fleetStatus) {
        if (v.remaining_capacity <= 0) continue;

        let typeMatchScore = 0;
        if (reqType === "REFRIGERATED" && v.vehicle_type !== "REFRIGERATED")
          continue;
        if (reqType === "COVERED" && v.vehicle_type === "UNCOVERED") continue;

        if (reqType === v.vehicle_type) typeMatchScore = 100;
        else if (v.vehicle_type === "REFRIGERATED" && reqType === "COVERED")
          typeMatchScore = 50;
        else if (v.vehicle_type === "COVERED" && reqType === "UNCOVERED")
          typeMatchScore = 50;
        else if (v.vehicle_type === "REFRIGERATED" && reqType === "UNCOVERED")
          typeMatchScore = 10;

        if (v.vehicle_type === "COVERED" || v.vehicle_type === "REFRIGERATED") {
          if (specs.ethylene_producer && v.has_ethylene_sensitive) continue;
          if (specs.ethylene_sensitive && v.has_ethylene_producer) continue;
        }

        const loadAmount = Math.min(remainingQty, v.remaining_capacity);
        const utilizationScore = (loadAmount / v.remaining_capacity) * 50;
        const currentScore = typeMatchScore + utilizationScore;

        if (currentScore > bestScore) {
          bestScore = currentScore;
          bestVehicle = v;
        }
      }

      if (!bestVehicle) {
        console.log(
          `      ❌ CRITICAL: No vehicles left to fulfill remaining ${remainingQty}kg!`,
        );
        break;
      }

      const loadAmount = Math.min(remainingQty, bestVehicle.remaining_capacity);
      remainingQty -= loadAmount;
      bestVehicle.remaining_capacity -= loadAmount;

      if (specs.ethylene_producer) bestVehicle.has_ethylene_producer = true;
      if (specs.ethylene_sensitive) bestVehicle.has_ethylene_sensitive = true;
      if (requiresCooling) bestVehicle.is_reefer_on = true;

      bestVehicle.assigned_orders.push({
        ...order,
        allocated_quantity: loadAmount,
        _algo: order._algo,
      });

      console.log(
        `      ✅ Assigned ${loadAmount}kg to ${bestVehicle.vehicle_license_plate} (${bestVehicle.vehicle_type})`,
      );
      if (remainingQty > 0)
        console.log(
          `      ⚠️ Order Split! ${remainingQty}kg remaining. Finding next vehicle...`,
        );
    }
  }

  console.log("\n🛣️  PHASE 4: Route Optimization & Manifest Generation");
  for (let v of fleetStatus) {
    if (v.assigned_orders.length === 0) continue;

    console.log(
      `\n   🚛 Vehicle: ${v.vehicle_license_plate} | Load: ${v.capacity_kg - v.remaining_capacity}kg | Reefer ON: ${v.is_reefer_on}`,
    );

    const optimizedManifest = await optimizeManifest(
      v.assigned_orders,
      v.current_lat,
      v.current_lng,
    );

    optimizedManifest.forEach((stop) => {
      const locName = getCityName(stop.lat, stop.lng);
      console.log(
        `      ${stop.sequence}. [${stop.type}] ${locName} (Order: ${stop.order_id}) - ${stop.distance_from_last_km}km`,
      );
    });
  }

  console.log("\n🎉 SIMULATION COMPLETE!");
}

runSimulation();
