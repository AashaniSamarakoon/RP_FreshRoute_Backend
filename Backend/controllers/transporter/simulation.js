// ============================================================================
// 🚛 LOGISTICS ASSIGNMENT ENGINE - MATARA DISTRICT SIMULATION
// ============================================================================

// --- 1. MOCK DATABASE (STRICTLY MATARA DISTRICT) ---
const MATARA_CITIES = {
  matara_town: { lat: 5.9496, lng: 80.5353, name: "Matara Town" },
  weligama: { lat: 5.9736, lng: 80.4283, name: "Weligama" },
  dickwella: { lat: 5.968, lng: 80.6974, name: "Dickwella" },
  akuressa: { lat: 6.0955, lng: 80.4851, name: "Akuressa" },
  hakmana: { lat: 6.136, lng: 80.6453, name: "Hakmana" },
  kamburugamuwa: { lat: 5.9555, lng: 80.4996, name: "Kamburugamuwa" },
};

const MOCK_SPECS = {
  TJC: {
    variant_name: "TJC",
    max_safe_temp_c: 25,
    force_refrigeration: false,
    max_dist_uncooled_km: 150,
    ethylene_producer: false,
    ethylene_sensitive: true,
  },
  Ambul: {
    variant_name: "Ambul",
    max_safe_temp_c: 28,
    force_refrigeration: false,
    max_dist_uncooled_km: 100,
    ethylene_producer: true,
    ethylene_sensitive: false,
  },
  ALL: {
    variant_name: "ALL",
    max_safe_temp_c: 28,
    force_refrigeration: false,
    max_dist_uncooled_km: 150,
    ethylene_producer: false,
    ethylene_sensitive: false,
  },
};

const MOCK_FLEET = [
  {
    id: "V1",
    vehicle_license_plate: "MAT-REEF-01",
    vehicle_type: "REFRIGERATED",
    capacity_kg: 1500,
    current_lat: MATARA_CITIES.matara_town.lat,
    current_lng: MATARA_CITIES.matara_town.lng,
  },
  {
    id: "V2",
    vehicle_license_plate: "MAT-REEF-02",
    vehicle_type: "REFRIGERATED",
    capacity_kg: 2000,
    current_lat: MATARA_CITIES.weligama.lat,
    current_lng: MATARA_CITIES.weligama.lng,
  },
  {
    id: "V3",
    vehicle_license_plate: "MAT-OPEN-01",
    vehicle_type: "UNCOVERED",
    capacity_kg: 4000,
    current_lat: MATARA_CITIES.dickwella.lat,
    current_lng: MATARA_CITIES.dickwella.lng,
  },
];

const MOCK_ORDERS = [
  // Total Reefer Demand at 30°C: 8,500kg. Fleet Reefer Capacity: 3,500kg.
  {
    id: "ORD-1-MANGO",
    fruit_variant: "TJC",
    quantity: 1000,
    pickup_location: "Akuressa",
    drop_location: "Matara Town",
    pickup_lat: MATARA_CITIES.akuressa.lat,
    pickup_lng: MATARA_CITIES.akuressa.lng,
    drop_lat: MATARA_CITIES.matara_town.lat,
    drop_lng: MATARA_CITIES.matara_town.lng,
  },
  {
    id: "ORD-2-BANANA",
    fruit_variant: "Ambul",
    quantity: 2000,
    pickup_location: "Hakmana",
    drop_location: "Weligama",
    pickup_lat: MATARA_CITIES.hakmana.lat,
    pickup_lng: MATARA_CITIES.hakmana.lng,
    drop_lat: MATARA_CITIES.weligama.lat,
    drop_lng: MATARA_CITIES.weligama.lng,
  },
  {
    id: "ORD-3-PINEAPPLE",
    fruit_variant: "ALL",
    quantity: 4000,
    pickup_location: "Dickwella",
    drop_location: "Matara Town",
    pickup_lat: MATARA_CITIES.dickwella.lat,
    pickup_lng: MATARA_CITIES.dickwella.lng,
    drop_lat: MATARA_CITIES.matara_town.lat,
    drop_lng: MATARA_CITIES.matara_town.lng,
  },
  {
    id: "ORD-4-PINEAPPLE",
    fruit_variant: "ALL",
    quantity: 1500,
    pickup_location: "Kamburugamuwa",
    drop_location: "Dickwella",
    pickup_lat: MATARA_CITIES.kamburugamuwa.lat,
    pickup_lng: MATARA_CITIES.kamburugamuwa.lng,
    drop_lat: MATARA_CITIES.dickwella.lat,
    drop_lng: MATARA_CITIES.dickwella.lng,
  },
];

// --- 2. MOCKED UTILITIES ---
function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return (
    Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10
  );
}

// Local Matara roads: shorter distances, lower speeds (30km/h average)
async function getDrivingDistanceKm(lat1, lon1, lat2, lon2) {
  const dist = calculateDistanceKm(lat1, lon1, lat2, lon2) * 1.3;
  return {
    distanceKm: Math.round(dist),
    durationMins: Math.round((dist / 30) * 60),
  };
}

// It's a hot day in Matara (30°C) - everything needs cooling!
async function getRealWeather(lat, lng) {
  return { temp_c: 30, raining: false, condition: "Clear" };
}

// --- 3. ROUTE OPTIMIZER ---
async function optimizeManifest(orders, startLat, startLng) {
  let startNode = { id: "START", type: "START", lat: startLat, lng: startLng };
  let unvisitedStops = [];

  orders.forEach((o) => {
    unvisitedStops.push({
      id: `PICK-${o.id}`,
      type: "PICKUP",
      lat: o._algo.pLat,
      lng: o._algo.pLng,
      orderId: o.id,
      allocated_quantity: o.allocated_quantity,
      fruit_variant: o.fruit_variant,
      location_name: o.pickup_location,
    });
    unvisitedStops.push({
      id: `DROP-${o.id}`,
      type: "DROP",
      lat: o._algo.dLat,
      lng: o._algo.dLng,
      orderId: o.id,
      allocated_quantity: o.allocated_quantity,
      fruit_variant: o.fruit_variant,
      location_name: o.drop_location,
    });
  });

  const allNodes = [startNode, ...unvisitedStops];
  const distanceMatrix = {};
  for (let i = 0; i < allNodes.length; i++) {
    distanceMatrix[allNodes[i].id] = {};
    for (let j = 0; j < allNodes.length; j++) {
      if (i === j)
        distanceMatrix[allNodes[i].id][allNodes[j].id] = {
          distanceKm: 0,
          durationMins: 0,
        };
      else
        distanceMatrix[allNodes[i].id][allNodes[j].id] =
          await getDrivingDistanceKm(
            allNodes[i].lat,
            allNodes[i].lng,
            allNodes[j].lat,
            allNodes[j].lng,
          );
    }
  }

  let route = [];
  let onboardOrders = new Set();
  let currentPosId = startNode.id;

  while (unvisitedStops.length > 0) {
    const validCandidates = unvisitedStops.filter(
      (stop) =>
        stop.type === "PICKUP" ||
        (stop.type === "DROP" && onboardOrders.has(stop.orderId)),
    );
    if (validCandidates.length === 0) break;

    let closestStop = null;
    let minDist = Infinity;
    let minDuration = Infinity;
    for (const stop of validCandidates) {
      const d = distanceMatrix[currentPosId][stop.id].durationMins;
      const dist = distanceMatrix[currentPosId][stop.id].distanceKm;
      if (d < minDuration) {
        minDist = dist;
        minDuration = d;
        closestStop = stop;
      }
    }

    route.push({
      id: closestStop.id,
      sequence: route.length + 1,
      type: closestStop.type,
      lat: closestStop.lat,
      lng: closestStop.lng,
      distance_from_last_km: minDist,
      estimated_duration_mins: minDuration,
      order_id: closestStop.orderId,
      allocated_quantity: closestStop.allocated_quantity,
      fruit_variant: closestStop.fruit_variant,
      location_name: closestStop.location_name,
    });
    currentPosId = closestStop.id;
    if (closestStop.type === "PICKUP") onboardOrders.add(closestStop.orderId);
    unvisitedStops = unvisitedStops.filter((s) => s.id !== closestStop.id);
  }

  route.forEach((stop, index) => {
    stop.sequence = index + 1;
    delete stop.id;
  });
  return route;
}

// --- 4. BATCH CONTROLLER ---
async function runSimulation() {
  console.log("=====================================================");
  console.log("🌴 MATARA DISTRICT LOGISTICS SIMULATION STARTED");
  console.log("=====================================================\n");

  const MAX_SHIFT_MINUTES = 600;
  const MINS_PER_STOP = 30; // Still takes 30 mins to load/unload

  let fleetStatus = MOCK_FLEET.map((v) => ({
    ...v,
    remaining_capacity: v.capacity_kg,
    assigned_orders: [],
    has_ethylene_producer: false,
    has_ethylene_sensitive: false,
    is_reefer_on: false,
    minutes_worked: 0,
    is_shift_over: false,
    trips_completed: 0,
  }));

  console.log("[PHASE 1] Scanning Environment (Live Weather: 30°C)...");
  const enrichedOrders = [];
  for (const order of MOCK_ORDERS) {
    const specs = MOCK_SPECS[order.fruit_variant];
    const routingData = await getDrivingDistanceKm(
      order.pickup_lat,
      order.pickup_lng,
      order.drop_lat,
      order.drop_lng,
    );
    const weather = await getRealWeather(order.pickup_lat, order.pickup_lng);

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
    }

    enrichedOrders.push({
      ...order,
      _algo: {
        pLat: order.pickup_lat,
        pLng: order.pickup_lng,
        dLat: order.drop_lat,
        dLng: order.drop_lng,
        reqType,
        requiresCooling,
        strictnessScore,
        specs,
      },
    });
  }

  console.log(
    "[PHASE 2] Executing FFD Triage (Strictness -> Fragility -> Size)...",
  );
  enrichedOrders.sort((a, b) => {
    if (a._algo.strictnessScore !== b._algo.strictnessScore)
      return b._algo.strictnessScore - a._algo.strictnessScore;
    if (a._algo.specs.max_safe_temp_c !== b._algo.specs.max_safe_temp_c)
      return a._algo.specs.max_safe_temp_c - b._algo.specs.max_safe_temp_c;
    return b.quantity - a.quantity;
  });
  console.log(
    " -> Top Priority:",
    enrichedOrders[0].id,
    `(${enrichedOrders[0].fruit_variant})`,
  );

  console.log("\n[PHASE 3] Initiating Multi-Wave Bin Packing & Routing...");
  let pendingFractions = enrichedOrders.map((o) => ({
    ...o,
    remainingQty: o.quantity,
  }));
  let waveCounter = 1;

  while (pendingFractions.length > 0) {
    let packedAnythingInThisWave = false;

    // Reset Fleet physical space (but keep shift time)
    for (let v of fleetStatus) {
      if (v.is_shift_over) continue;
      v.remaining_capacity = v.capacity_kg;
      v.assigned_orders = [];
      v.has_ethylene_producer = false;
      v.has_ethylene_sensitive = false;
      v.is_reefer_on = false;
    }

    for (let i = 0; i < pendingFractions.length; i++) {
      let orderObj = pendingFractions[i];
      if (orderObj.remainingQty <= 0) continue;
      const { reqType, requiresCooling, specs } = orderObj._algo;

      while (orderObj.remainingQty > 0) {
        let bestVehicle = null;
        let bestScore = -Infinity;

        for (let v of fleetStatus) {
          if (v.is_shift_over || v.remaining_capacity <= 0) continue;

          let typeMatchScore = 0;
          if (reqType === "REFRIGERATED" && v.vehicle_type !== "REFRIGERATED")
            continue;
          if (reqType === "COVERED" && v.vehicle_type === "UNCOVERED") continue;
          if (reqType === v.vehicle_type) typeMatchScore = 100;
          else if (v.vehicle_type === "REFRIGERATED" && reqType === "UNCOVERED")
            typeMatchScore = 10;

          if (
            v.vehicle_type === "COVERED" ||
            v.vehicle_type === "REFRIGERATED"
          ) {
            if (specs.ethylene_producer && v.has_ethylene_sensitive) continue;
            if (specs.ethylene_sensitive && v.has_ethylene_producer) continue;
          }

          const loadAmount = Math.min(
            orderObj.remainingQty,
            v.remaining_capacity,
          );
          const utilizationScore = (loadAmount / v.capacity_kg) * 50;

          const emptyDriveKm = calculateDistanceKm(
            v.current_lat,
            v.current_lng,
            orderObj._algo.pLat,
            orderObj._algo.pLng,
          );
          const proximityScore = Math.max(0, 100 - emptyDriveKm);

          const currentScore =
            typeMatchScore + utilizationScore + proximityScore;
          if (currentScore > bestScore) {
            bestScore = currentScore;
            bestVehicle = v;
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
        if (requiresCooling) bestVehicle.is_reefer_on = true;

        bestVehicle.assigned_orders.push({
          ...orderObj,
          allocated_quantity: loadAmount,
        });
        packedAnythingInThisWave = true;
      }
    }

    if (!packedAnythingInThisWave) break;

    console.log(
      `\n================= PROCESSING WAVE ${waveCounter} =================`,
    );
    for (let v of fleetStatus) {
      if (v.assigned_orders.length === 0) continue;
      const optimizedManifest = await optimizeManifest(
        v.assigned_orders,
        v.current_lat,
        v.current_lng,
      );

      const driveTimeMins = optimizedManifest.reduce(
        (sum, stop) => sum + stop.estimated_duration_mins,
        0,
      );
      const serviceTimeMins = optimizedManifest.length * MINS_PER_STOP;
      const totalTripTime = driveTimeMins + serviceTimeMins;

      v.minutes_worked += totalTripTime;
      const loadedVariants = [
        ...new Set(v.assigned_orders.map((o) => o.fruit_variant)),
      ].join(" & ");
      const routeName = `Trip ${v.trips_completed + 1}: (${loadedVariants})`;

      console.log(
        `\n🚚 ${v.vehicle_license_plate} (${v.vehicle_type}) | ${routeName}`,
      );
      console.log(
        `   ⏱️  Trip Time: ${totalTripTime} mins | Shift Total: ${v.minutes_worked}/${MAX_SHIFT_MINUTES} mins`,
      );

      optimizedManifest.forEach((m) => {
        const icon = m.type === "PICKUP" ? "🔼" : "🔽";
        console.log(
          `   ${icon} [${m.sequence}] ${m.type} ${m.allocated_quantity}kg ${m.fruit_variant} @ ${m.location_name} (Drive: ${m.estimated_duration_mins}m)`,
        );
      });

      if (MAX_SHIFT_MINUTES - v.minutes_worked < 120) {
        v.is_shift_over = true;
        console.log(
          `   🛑 [SHIFT END] Driver sent home (Less than 2 hrs remaining).`,
        );
      }

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

  // --- 6. 3PL OVERFLOW ---
  if (pendingFractions.length > 0) {
    console.log(
      `\n🚨 [CRITICAL 3PL OVERFLOW] Internal Fleet Maxed Out! Diverting ${pendingFractions.length} fractions...`,
    );
    const overflowPayload = pendingFractions.map((o) => ({
      ...o,
      allocated_quantity: o.remainingQty,
    }));
    const overflowManifest = await optimizeManifest(
      overflowPayload,
      MATARA_CITIES.matara_town.lat,
      MATARA_CITIES.matara_town.lng,
    );

    console.log(`\n🏢 [SUBCONTRACTOR DISPATCH] - REQUIRES ADMIN ASSIGNMENT`);
    overflowManifest.forEach((m) => {
      const icon = m.type === "PICKUP" ? "🔼" : "🔽";
      console.log(
        `   ${icon} [${m.sequence}] ${m.type} ${m.allocated_quantity}kg ${m.fruit_variant} @ ${m.location_name}`,
      );
    });
  }

  console.log(
    `\n🎉 BATCH COMPLETE: Processed hyper-local routing for Matara District.`,
  );
}

runSimulation();
