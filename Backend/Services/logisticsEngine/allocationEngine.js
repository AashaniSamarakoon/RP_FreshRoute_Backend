const {
  getDrivingDistanceKm,
  calculateDistanceKm,
  getRealWeather,
  SRI_LANKA_CITIES,
} = require("./utils");
const { optimizeManifest } = require("./routeOptimizer");

async function runAllocationEngine(
  orders,
  availableFleet,
  specsMap,
  targetDate,
  print,
) {
  const MAX_SHIFT_MINUTES = 600;
  const MINS_PER_STOP = 30;
  const ROAD_FACTOR = 1.3;
  const scheduledJobs = [];
  const overflowJobs = [];

  let fleetStatus = availableFleet.map((v) => ({
    ...v,
    remaining_capacity: v.capacity_kg,
    assigned_orders: [],
    has_ethylene_producer: false,
    has_ethylene_sensitive: false,
    is_reefer_on: false,
    operating_temp_c: null,
    minutes_worked: 0,
    wave_est_minutes: 0,
    is_shift_over: false,
    trips_completed: 0,
  }));

  // PHASE 1: Data Enrichment
  const enrichedOrders = [];
  for (const order of orders) {
    const specs = specsMap[order.fruit_variant];
    let pLat =
      order.pickup_lat ||
      SRI_LANKA_CITIES[(order.pickup_location || "").toLowerCase()]?.lat;
    let pLng =
      order.pickup_lng ||
      SRI_LANKA_CITIES[(order.pickup_location || "").toLowerCase()]?.lng;
    let dLat =
      order.drop_lat ||
      SRI_LANKA_CITIES[(order.drop_location || "").toLowerCase()]?.lat;
    let dLng =
      order.drop_lng ||
      SRI_LANKA_CITIES[(order.drop_location || "").toLowerCase()]?.lng;

    const routingData = await getDrivingDistanceKm(pLat, pLng, dLat, dLng);
    const weather = await getRealWeather(pLat, pLng);

    let reqType = "UNCOVERED";
    let requiresCooling = false;
    let strictnessScore = 1;
    if (
      specs.force_refrigeration ||
      weather.temp_c > specs.max_safe_temp_c ||
      routingData.distanceKm > specs.max_dist_uncooled_km
    ) {
      reqType = "REFRIGERATED";
      requiresCooling = true;
      strictnessScore = 3;
    } else if (weather.raining) {
      reqType = "COVERED";
      requiresCooling = false;
      strictnessScore = 2;
    }

    enrichedOrders.push({
      ...order,
      _algo: {
        pLat,
        pLng,
        dLat,
        dLng,
        reqType,
        requiresCooling,
        strictnessScore,
        specs,
      },
    });
  }

  // PHASE 2: FFD Triage
  enrichedOrders.sort((a, b) => {
    if (a._algo.strictnessScore !== b._algo.strictnessScore)
      return b._algo.strictnessScore - a._algo.strictnessScore;
    if (a._algo.specs.max_safe_temp_c !== b._algo.specs.max_safe_temp_c)
      return a._algo.specs.max_safe_temp_c - b._algo.specs.max_safe_temp_c;
    return b.quantity - a.quantity;
  });

  // PHASE 3: Multi-Wave Allocation
  let pendingFractions = enrichedOrders.map((o) => ({
    ...o,
    remainingQty: o.quantity,
  }));
  let waveCounter = 1;

  while (pendingFractions.length > 0) {
    let packedAnythingInThisWave = false;

    // Wipe trucks for the new wave
    for (let v of fleetStatus) {
      if (v.is_shift_over) continue;
      v.remaining_capacity = v.capacity_kg;
      v.assigned_orders = [];
      v.has_ethylene_producer = false;
      v.has_ethylene_sensitive = false;
      v.is_reefer_on = false;
      v.operating_temp_c = null;
      v.wave_est_minutes = 0;
    }

    for (let i = 0; i < pendingFractions.length; i++) {
      let orderObj = pendingFractions[i];
      if (orderObj.remainingQty <= 0) continue;
      const { reqType, requiresCooling, specs } = orderObj._algo;

      while (orderObj.remainingQty > 0) {
        let bestVehicle = null;
        let bestScore = -Infinity;
        let bestEstMins = 0;

        for (let v of fleetStatus) {
          if (v.is_shift_over || v.remaining_capacity <= 0) continue;

          // 1. Core Suitability
          if (reqType === "REFRIGERATED" && v.vehicle_type !== "REFRIGERATED")
            continue;
          if (reqType === "COVERED" && v.vehicle_type === "UNCOVERED") continue;

          // 2. The Freshness Shield: Ethylene
          if (
            v.vehicle_type === "COVERED" ||
            v.vehicle_type === "REFRIGERATED"
          ) {
            if (specs.ethylene_producer && v.has_ethylene_sensitive) continue;
            if (specs.ethylene_sensitive && v.has_ethylene_producer) continue;
          }

          // 3. The Freshness Shield
          if (
            v.vehicle_type === "REFRIGERATED" &&
            v.is_reefer_on &&
            v.operating_temp_c !== null
          ) {
            if (
              v.operating_temp_c < specs.min_safe_temp_c ||
              v.operating_temp_c > specs.max_safe_temp_c
            ) {
              continue; // Reject Temperature mismatch
            }
          }

          // 4. Predictive Time Boxing (road-adjusted + wave-accumulated)
          // Fix 1: multiply by ROAD_FACTOR so the prediction matches real driving distance.
          // Fix 2: use wave_est_minutes to account for orders already committed this wave,
          //        so later orders in the same wave cannot silently overrun the shift limit.
          const emptyKm = calculateDistanceKm(
            v.current_lat || SRI_LANKA_CITIES.colombo.lat,
            v.current_lng || SRI_LANKA_CITIES.colombo.lng,
            orderObj._algo.pLat,
            orderObj._algo.pLng,
          ) * ROAD_FACTOR;
          const loadedKm = calculateDistanceKm(
            orderObj._algo.pLat,
            orderObj._algo.pLng,
            orderObj._algo.dLat,
            orderObj._algo.dLng,
          ) * ROAD_FACTOR;
          // First order in this wave: count the empty drive to the pickup.
          // Subsequent orders: count only the loaded leg — the route optimizer handles
          // inter-stop positioning, and this prevents double-counting the empty drive.
          const travelKm = v.assigned_orders.length === 0
            ? emptyKm + loadedKm
            : loadedKm;
          const estTimeMins = Math.round((travelKm / 40) * 60) + (2 * MINS_PER_STOP);
          if (v.minutes_worked + v.wave_est_minutes + estTimeMins > MAX_SHIFT_MINUTES) continue;

          // 5. Scoring
          let typeScore =
            reqType === v.vehicle_type
              ? 100
              : v.vehicle_type === "REFRIGERATED" && reqType !== "REFRIGERATED"
                ? 10
                : 50;
          const loadAmt = Math.min(orderObj.remainingQty, v.remaining_capacity);
          const utilScore = (loadAmt / v.capacity_kg) * 50;
          const currentScore =
            typeScore + utilScore + Math.max(0, 100 - emptyKm);

          if (currentScore > bestScore) {
            bestScore = currentScore;
            bestVehicle = v;
            bestEstMins = estTimeMins;
          }
        }

        if (!bestVehicle) break;

        const loadAmount = Math.min(
          orderObj.remainingQty,
          bestVehicle.remaining_capacity,
        );
        orderObj.remainingQty -= loadAmount;
        bestVehicle.remaining_capacity -= loadAmount;

        if (specs.ethylene_producer) bestVehicle.has_ethylene_producer = true;
        if (specs.ethylene_sensitive) bestVehicle.has_ethylene_sensitive = true;

        // Set the Thermostat on the first load
        if (requiresCooling && !bestVehicle.is_reefer_on) {
          bestVehicle.is_reefer_on = true;
          bestVehicle.operating_temp_c = specs.optimal_temp_c;
        }

        bestVehicle.assigned_orders.push({
          ...orderObj,
          allocated_quantity: loadAmount,
        });
        bestVehicle.wave_est_minutes += bestEstMins;
        packedAnythingInThisWave = true;
      }
    }

    if (!packedAnythingInThisWave) break;

    // PHASE 4: Manifest Generation
    print(`--- Processing Wave ${waveCounter} ---`);
    for (let v of fleetStatus) {
      if (v.assigned_orders.length === 0) continue;

      const totalLoad = v.capacity_kg - v.remaining_capacity;
      const startLat = v.current_lat || SRI_LANKA_CITIES.colombo.lat;
      const startLng = v.current_lng || SRI_LANKA_CITIES.colombo.lng;

      const optimizedManifest = await optimizeManifest(
        v.assigned_orders,
        startLat,
        startLng,
      );

      const driveTimeMins = optimizedManifest.reduce(
        (sum, stop) => sum + stop.estimated_duration_mins,
        0,
      );
      const serviceTimeMins = optimizedManifest.length * MINS_PER_STOP;
      const totalTripTime = driveTimeMins + serviceTimeMins;

      v.minutes_worked += totalTripTime;
      if (MAX_SHIFT_MINUTES - v.minutes_worked < 120) v.is_shift_over = true;

      const loadedVariants = [
        ...new Set(v.assigned_orders.map((o) => o.fruit_variant)),
      ].join(" & ");
      const routeName = `Trip ${v.trips_completed + 1}: Logistics Run (${loadedVariants})`;

      scheduledJobs.push({
        job_date: targetDate,
        vehicle_id: v.id,
        vehicle_type_assigned: v.vehicle_type,
        cooling_unit_on: v.is_reefer_on,
        set_temperature_c: v.operating_temp_c,
        total_weight_kg: totalLoad,
        route_manifest: optimizedManifest,
        route_name: routeName,
        status: "SCHEDULED",
        __assignedOrderIds: [...new Set(v.assigned_orders.map((o) => o.id))],
      });

      v.trips_completed += 1;
      if (optimizedManifest.length > 0) {
        const finalStop = optimizedManifest[optimizedManifest.length - 1];
        v.current_lat = finalStop.lat;
        v.current_lng = finalStop.lng;
      }
    }

    pendingFractions = pendingFractions.filter((o) => o.remainingQty > 0);
    waveCounter++;
  }

  // PHASE 5: 3PL Overflow
  if (pendingFractions.length > 0) {
    const totalOverflowWeight = pendingFractions.reduce(
      (sum, o) => sum + o.remainingQty,
      0,
    );
    const overflowPayload = pendingFractions.map((o) => ({
      ...o,
      allocated_quantity: o.remainingQty,
    }));
    const overflowManifest = await optimizeManifest(
      overflowPayload,
      SRI_LANKA_CITIES.colombo.lat,
      SRI_LANKA_CITIES.colombo.lng,
    );

    overflowJobs.push({
      job_date: targetDate,
      vehicle_id: null,
      vehicle_type_assigned: "REQUIRES_EXTERNAL_FLEET",
      total_weight_kg: totalOverflowWeight,
      route_manifest: overflowManifest,
      route_name: "URGENT: 3PL Subcontractor Required",
      status: "REQUIRES_ADMIN_ASSIGNMENT",
      __assignedOrderIds: [...new Set(pendingFractions.map((o) => o.id))],
    });
  }

  return { scheduledJobs, overflowJobs, wavesProcessed: waveCounter - 1 };
}

module.exports = { runAllocationEngine };
