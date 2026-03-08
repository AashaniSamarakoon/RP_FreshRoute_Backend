// Replace the path with wherever your supabase client is stored
const { supabase } = require("../../utils/supabaseClient");
const { optimizeManifest } = require("../../utils/routeOptimizer");
const {
  getDrivingDistanceKm,
  getRealWeather,
  SRI_LANKA_CITIES,
} = require("../../utils/logisticsUtils");

exports.runDailyBatch = async (req, res) => {
  const { targetDate } = req.body;
  const logs = [];
  const print = (m) => {
    console.log(m);
    logs.push(m);
  };

  print(`[BATCH START] Running Assignment Engine for: ${targetDate}`);

  try {
    // 1. DATA INGESTION
    const { data: orders } = await supabase
      .from("orders")
      .select("*")
      .eq("status", "pending")
      .eq("pickup_date", targetDate);
    if (!orders?.length) return res.json({ message: "No pending orders." });

    const variants = [...new Set(orders.map((o) => o.fruit_variant))];
    const { data: allSpecs } = await supabase
      .from("fruit_specs")
      .select("*")
      .in("variant_name", variants);
    const specsMap = allSpecs.reduce(
      (acc, s) => ({ ...acc, [s.variant_name]: s }),
      {},
    );

    const { data: busyJobs } = await supabase
      .from("transport_jobs")
      .select("vehicle_id")
      .eq("job_date", targetDate);
    const busyIds = busyJobs.map((j) => j.vehicle_id);

    let vehicleQuery = supabase
      .from("vehicles")
      .select("*")
      .eq("status", "AVAILABLE");
    if (busyIds.length > 0)
      vehicleQuery = vehicleQuery.not("id", "in", `(${busyIds.join(",")})`);
    let { data: availableFleet } = await vehicleQuery;

    let fleetStatus = availableFleet.map((v) => ({
      ...v,
      remaining_capacity: v.capacity_kg,
      assigned_orders: [],
      has_ethylene_producer: false,
      has_ethylene_sensitive: false,
      is_reefer_on: false,
    }));

    // 2. ORDER PRE-PROCESSING & ENVIRONMENTAL ENRICHMENT
    print(`[PHASE 2] Enriching ${orders.length} orders with constraints...`);
    const enrichedOrders = [];

    for (const order of orders) {
      const specs = specsMap[order.fruit_variant];
      if (!specs) throw new Error(`Missing specs for ${order.fruit_variant}`);

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
      const distance = routingData.distanceKm;
      const weather = await getRealWeather(pLat, pLng);

      let reqType = "UNCOVERED";
      let requiresCooling = false;
      let reason = "Optimal conditions met";
      let strictnessScore = 1;

      if (
        specs.force_refrigeration ||
        weather.temp_c > specs.max_safe_temp_c ||
        distance > specs.max_dist_uncooled_km
      ) {
        reqType = "REFRIGERATED";
        requiresCooling = true;
        reason = `Heat/Distance Limit`;
        strictnessScore = 3;
      } else if (weather.raining) {
        reqType = "COVERED";
        requiresCooling = false;
        reason = "Rain Forecasted";
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
          reason,
          strictnessScore,
          specs,
        },
      });
    }

    // 3. FIRST-FIT DECREASING (FFD) SORTING
    enrichedOrders.sort((a, b) => {
      if (a._algo.strictnessScore !== b._algo.strictnessScore) {
        return b._algo.strictnessScore - a._algo.strictnessScore;
      }
      return b.quantity - a.quantity;
    });

    // 4. MULTI-CONSTRAINT BIN PACKING & SPLITTING
    print(`[PHASE 4] Initiating Allocation Engine...`);
    const createdJobs = [];

    for (const order of enrichedOrders) {
      let remainingQty = order.quantity;
      const { reqType, requiresCooling, specs } = order._algo;

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

          // Ethylene Constraint Check
          if (
            v.vehicle_type === "COVERED" ||
            v.vehicle_type === "REFRIGERATED"
          ) {
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
          print(
            `[ALERT] No suitable vehicles left to fulfill remaining ${remainingQty}kg of Order ${order.id}`,
          );
          break;
        }

        const loadAmount = Math.min(
          remainingQty,
          bestVehicle.remaining_capacity,
        );
        remainingQty -= loadAmount;
        bestVehicle.remaining_capacity -= loadAmount;

        if (specs.ethylene_producer) bestVehicle.has_ethylene_producer = true;
        if (specs.ethylene_sensitive) bestVehicle.has_ethylene_sensitive = true;
        if (requiresCooling) bestVehicle.is_reefer_on = true;

        bestVehicle.assigned_orders.push({
          ...order,
          allocated_quantity: loadAmount,
        });
      }
    }

    // 5. JOB MANIFEST GENERATION & DB COMMIT
    for (let v of fleetStatus) {
      if (v.assigned_orders.length === 0) continue;

      const totalLoad = v.capacity_kg - v.remaining_capacity;
      const startLat = v.current_lat || SRI_LANKA_CITIES.colombo.lat;
      const startLng = v.current_lng || SRI_LANKA_CITIES.colombo.lng;

      print(`[OPTIMIZER] Generating route for ${v.vehicle_license_plate}...`);
      const optimizedManifest = await optimizeManifest(
        v.assigned_orders,
        startLat,
        startLng,
      );

      const { data: jobData, error: jobError } = await supabase
        .from("transport_jobs")
        .insert({
          job_date: targetDate,
          vehicle_id: v.id,
          vehicle_type_assigned: v.vehicle_type,
          cooling_unit_on: v.is_reefer_on,
          total_weight_kg: totalLoad,
          route_manifest: optimizedManifest,
          status: "SCHEDULED",
        })
        .select()
        .single();

      if (jobError) throw jobError;
      createdJobs.push(jobData);

      const orderIds = [...new Set(v.assigned_orders.map((o) => o.id))];
      await supabase
        .from("orders")
        .update({ status: "assigned", assigned_job_id: jobData.id })
        .in("id", orderIds);
    }

    print(`[BATCH COMPLETE] Created ${createdJobs.length} jobs successfully.`);
    res.json({ success: true, jobs: createdJobs, logs });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
};
