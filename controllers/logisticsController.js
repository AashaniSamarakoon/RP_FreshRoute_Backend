const { supabase } = require("../supabaseClient");
const {
  calculateDistanceKm,
  getMockWeather,
  SRI_LANKA_CITIES,
} = require("../utils/logisticsUtils");

exports.assignVehicleToOrder = async (req, res) => {
  const { orderId } = req.body;
  const logs = [];
  const print = (msg) => {
    console.log(msg);
    logs.push(msg);
  };

  try {
    print(`\n=== 🚛 STARTING ALGORITHM FOR ORDER: ${orderId} ===`);

    // ====================================================
    // STEP 1: FETCH DATA (Order, Fruit Specs)
    // ====================================================

    // 1.1 Get Order
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .single();

    if (orderErr || !order)
      return res.status(404).json({ error: "Order not found" });
    print(`[DATA] Order: ${order.quantity}kg of ${order.fruit_variant}`);

    // 1.2 Get Fruit Specs
    const { data: specs, error: specErr } = await supabase
      .from("fruit_specs")
      .select("*")
      .eq("variant_name", order.fruit_variant)
      .single();

    if (specErr || !specs) {
      print(`[ERROR] No specs for ${order.fruit_variant}`);
      return res.status(400).json({ error: "Unknown fruit variant" });
    }

    // ====================================================
    // STEP 2: CALCULATE EXTERNAL FACTORS (Weather, Distance)
    // ====================================================

    // 2.1 Coordinate Logic
    // If DB has lat/long use it, else fallback to City Map
    let pLat = order.pickup_lat,
      pLng = order.pickup_lng;
    let dLat = order.drop_lat,
      dLng = order.drop_lng;

    // Fallback if coords are missing in DB
    if (!pLat) {
      const city = SRI_LANKA_CITIES[order.pickup_location.toLowerCase()];
      if (city) {
        pLat = city.lat;
        pLng = city.lng;
      }
    }
    if (!dLat) {
      const city = SRI_LANKA_CITIES[order.drop_location.toLowerCase()];
      if (city) {
        dLat = city.lat;
        dLng = city.lng;
      }
    }

    // 2.2 Calculate Distance
    let distance = 0;
    if (pLat && dLat) {
      distance = calculateDistanceKm(pLat, pLng, dLat, dLng);
      print(`[MAPS] Route: ${order.pickup_location} -> ${order.drop_location}`);
      print(`[MAPS] Calculated Distance: ${distance} km`);
    } else {
      print(`[WARN] Coordinates missing. Assuming safe distance.`);
      distance = 50; // Default safety
    }

    // 2.3 Get Weather
    const weather = await getMockWeather(
      order.pickup_date,
      order.pickup_location
    );
    print(
      `[WEATHER] Condition at ${order.pickup_location}: ${weather.temp_c}°C, ${weather.condition}`
    );

    // ====================================================
    // STEP 3: DETERMINE VEHICLE TYPE (The Freshness Algo)
    // ====================================================

    let requiredType = "UNCOVERED"; // Start with cheapest
    let reason = "Optimal conditions";

    // CHECK 1: Product Specs (Strict)
    if (specs.force_refrigeration) {
      requiredType = "REFRIGERATED";
      reason = "Strict product requirement";
    }
    // CHECK 2: High Temperature
    else if (weather.temp_c > specs.max_safe_temp_c) {
      requiredType = "REFRIGERATED";
      reason = `High Heat (${weather.temp_c}°C > ${specs.max_safe_temp_c}°C)`;
    }
    // CHECK 3: Long Distance Spoilage
    else if (distance > specs.max_dist_uncooled_km) {
      requiredType = "REFRIGERATED";
      reason = `Long Distance (${distance}km)`;
    }
    // CHECK 4: Rain
    else if (weather.raining) {
      requiredType = "COVERED"; // Minimum requirement
      reason = "Raining (Water protection)";
    }

    print(`[DECISION] Required Type: ${requiredType} (${reason})`);

    // ====================================================
    // STEP 4: FLEET SELECTION & SPLITTING
    // ====================================================

    // 4.1 Define "Acceptable" types based on requirement
    // Hierarchy: REFRIGERATED (Best) > COVERED (Mid) > UNCOVERED (Basic)
    let acceptableTypes = [];

    if (requiredType === "REFRIGERATED") {
      acceptableTypes = ["REFRIGERATED"];
    } else if (requiredType === "COVERED") {
      // If we need Covered, we can use Covered OR Refrigerated (since Fridge is also closed)
      acceptableTypes = ["COVERED", "REFRIGERATED"];
    } else {
      // If Uncovered is fine, we can use ANYTHING, but prefer Uncovered (cheaper)
      acceptableTypes = ["UNCOVERED", "COVERED", "REFRIGERATED"];
    }

    // 4.2 Fetch Available Vehicles
    const { data: fleet, error: fleetErr } = await supabase
      .from("vehicles")
      .select("*")
      .eq("status", "AVAILABLE")
      .in("vehicle_type", acceptableTypes);

    if (fleetErr) throw fleetErr;

    // 4.3 Sort Vehicles
    // We want to fill large trucks first.
    // We ALSO want to prioritize the "Correct" type to save money.
    // (e.g. If we need Uncovered, use Uncovered before wasting a Fridge truck)

    fleet.sort((a, b) => {
      // Priority 1: Exact Type Match? (Simple heuristic: sort by type index)
      const typeScore = (type) => acceptableTypes.indexOf(type);
      if (typeScore(a.vehicle_type) !== typeScore(b.vehicle_type)) {
        return typeScore(a.vehicle_type) - typeScore(b.vehicle_type);
      }
      // Priority 2: Capacity (Big to Small)
      return b.capacity_kg - a.capacity_kg;
    });

    print(`[FLEET] Found ${fleet.length} candidate vehicles.`);

    // 4.4 Assign Logic (Bin Packing)
    let remainingQty = order.quantity;
    let assignments = [];
    let usedVehicleIds = [];

    for (let vehicle of fleet) {
      if (remainingQty <= 0) break;

      const load = Math.min(vehicle.capacity_kg, remainingQty);

      assignments.push({
        order_id: orderId,
        vehicle_id: vehicle.id,
        vehicle_type_assigned: vehicle.vehicle_type,
        load_weight_kg: load,
        pickup_geo: order.pickup_location,
        drop_geo: order.drop_location,
        assignment_reason: reason,
        status: "SCHEDULED",
      });

      usedVehicleIds.push(vehicle.id);
      remainingQty -= load;
      print(
        `   -> Allocated ${vehicle.vehicle_license_plate} (${vehicle.vehicle_type}). Load: ${load}kg`
      );
    }

    if (remainingQty > 0) {
      print(`[FAIL] Not enough vehicles! Shortage: ${remainingQty}kg`);
      return res.status(400).json({
        error: "Insufficient fleet capacity",
        shortage_kg: remainingQty,
        logs,
      });
    }

    // ====================================================
    // STEP 5: COMMIT TO DB
    // ====================================================

    // 5.1 Insert Jobs
    const { error: jobErr } = await supabase
      .from("transport_jobs")
      .insert(assignments);

    if (jobErr) throw jobErr;

    // 5.2 Update Vehicle Status (Make them BOOKED)
    const { error: updateErr } = await supabase
      .from("vehicles")
      .update({ status: "BOOKED" })
      .in("id", usedVehicleIds);

    // 5.3 Update Order Status
    await supabase
      .from("orders")
      .update({ status: "assigned" })
      .eq("id", orderId);

    print(`[SUCCESS] Jobs created. Vehicles booked.`);

    res.json({
      message: "Vehicles assigned successfully",
      algorithm_logs: logs,
      jobs: assignments,
    });
  } catch (err) {
    console.error("Assignment Error:", err);
    res.status(500).json({ error: "Server error during assignment" });
  }
};
