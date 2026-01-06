// // controllers/batchController.js
// const { supabase } = require("../../utils/supabaseClient");
// const { optimizeManifest } = require("../../utils/routeOptimizer");

// exports.runDailyBatch = async (req, res) => {
//   // 1. INPUT: Date to plan for
//   const { targetDate } = req.body; // e.g., "2025-01-20"
//   const logs = [];
//   const print = (m) => {
//     console.log(m);
//     logs.push(m);
//   };

//   print(`=== 🗓️ RUNNING BATCH FOR: ${targetDate} ===`);

//   try {
//     // --- A. GET PENDING ORDERS ---
//     const { data: orders } = await supabase
//       .from("orders")
//       .select("*")
//       .eq("status", "pending")
//       .eq("pickup_date", targetDate);

//     if (!orders || orders.length === 0)
//       return res.json({ message: "No orders found." });
//     print(`[DATA] Found ${orders.length} pending orders.`);

//     // --- B. GET AVAILABLE VEHICLES (Not busy on targetDate) ---
//     // Get IDs of vehicles already booked for this date
//     const { data: busyJobs } = await supabase
//       .from("transport_jobs")
//       .select("vehicle_id")
//       .eq("job_date", targetDate);

//     const busyIds = busyJobs.map((j) => j.vehicle_id);

//     // Fetch vehicles including their coordinates
//     let vehicleQuery = supabase
//       .from("vehicles")
//       .select("*") // Ensure this selects current_lat, current_lng
//       .eq("status", "AVAILABLE");

//     if (busyIds.length > 0)
//       vehicleQuery = vehicleQuery.not("id", "in", `(${busyIds.join(",")})`);

//     let { data: fleet } = await vehicleQuery;
//     print(`[FLEET] ${fleet.length} vehicles available for today.`);

//     // --- C. GROUP ORDERS (By Variant/Requirement) ---
//     // For simplicity: Group by 'fruit_variant'
//     let groups = {};
//     orders.forEach((o) => {
//       const key = o.fruit_variant; // e.g., 'MANGO_TJC'
//       if (!groups[key])
//         groups[key] = { items: [], totalWeight: 0, requiredType: "UNCOVERED" };

//       groups[key].items.push(o);
//       groups[key].totalWeight += o.quantity;

//       // Simple Logic: If TJC, force Refrigerated
//       if (key === "MANGO_TJC") groups[key].requiredType = "REFRIGERATED";
//       else groups[key].requiredType = "COVERED"; // Default for others
//     });

//     // --- D. ASSIGNMENT LOOP (Bin Packing) ---
//     const createdJobs = [];

//     for (const [variant, group] of Object.entries(groups)) {
//       print(
//         `[PLANNING] Group ${variant}: ${group.totalWeight}kg. Need: ${group.requiredType}`
//       );

//       let remainingOrders = [...group.items];

//       // Loop until all orders in this group are assigned or we run out of trucks
//       while (remainingOrders.length > 0) {
//         // 1. Find Best Truck
//         // Filter by Type
//         let candidates = fleet.filter((v) => {
//           if (group.requiredType === "REFRIGERATED")
//             return v.vehicle_type === "REFRIGERATED";
//           return true; // Simple fallback
//         });

//         // Sort by Capacity (Largest first to fit more)
//         candidates.sort((a, b) => b.capacity_kg - a.capacity_kg);
//         const vehicle = candidates[0];

//         if (!vehicle) {
//           print(`[ALERT] No suitable vehicle for remainder of ${variant}`);
//           break;
//         }

//         // 2. Fill Truck
//         let currentLoad = 0;
//         let assignedIds = [];
//         let jobOrders = [];
//         let nextRoundOrders = [];

//         remainingOrders.forEach((o) => {
//           if (currentLoad + o.quantity <= vehicle.capacity_kg) {
//             currentLoad += o.quantity;
//             assignedIds.push(o.id);
//             jobOrders.push(o);
//           } else {
//             nextRoundOrders.push(o);
//           }
//         });

//         if (assignedIds.length === 0) {
//           // Current smallest order is bigger than truck? Skip.
//           print(`[ERROR] Order too big for available truck.`);
//           break;
//         }

//         // 3. Optimize Route (UPDATED)
//         print(
//           `   -> Assigning ${vehicle.vehicle_license_plate} (${currentLoad}/${vehicle.capacity_kg}kg)`
//         );

//         // *** HERE IS THE UPDATE: Pass vehicle start location ***
//         const optimizedRoute = optimizeManifest(
//           jobOrders,
//           vehicle.current_lat,
//           vehicle.current_lng
//         );

//         // 4. Save Job
//         const { data: jobData, error: jobErr } = await supabase
//           .from("transport_jobs")
//           .insert({
//             job_date: targetDate,
//             vehicle_id: vehicle.id,
//             vehicle_type_assigned: vehicle.vehicle_type,
//             route_name: `${variant} Collection`,
//             total_weight_kg: currentLoad,
//             route_manifest: optimizedRoute,
//             status: "SCHEDULED",
//           })
//           .select()
//           .single();

//         if (!jobErr) {
//           // Update Orders
//           await supabase
//             .from("orders")
//             .update({ status: "assigned", assigned_job_id: jobData.id })
//             .in("id", assignedIds);

//           createdJobs.push(jobData);

//           // Remove vehicle from fleet so it's not used again this loop
//           fleet = fleet.filter((v) => v.id !== vehicle.id);
//         }

//         remainingOrders = nextRoundOrders;
//       }
//     }

//     res.json({ success: true, jobs: createdJobs, logs });
//   } catch (e) {
//     console.error(e);
//     res.status(500).json({ error: e.message });
//   }
// };

const { supabase } = require("../../utils/supabaseClient");
const { optimizeManifest } = require("../../utils/routeOptimizer");
const {
  calculateDistanceKm,
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

  print(`Running Batch for: ${targetDate}`);

  try {
    // 1. Fetch Pending Orders
    const { data: orders } = await supabase
      .from("orders")
      .select("*")
      .eq("status", "pending")
      .eq("pickup_date", targetDate);

    if (!orders?.length) return res.json({ message: "No pending orders." });

    // 2. Fetch Fruit Specs
    const variants = [...new Set(orders.map((o) => o.fruit_variant))];
    const { data: allSpecs } = await supabase
      .from("fruit_specs")
      .select("*")
      .in("variant_name", variants);

    const specsMap = allSpecs.reduce(
      (acc, s) => ({ ...acc, [s.variant_name]: s }),
      {}
    );

    // 3. Enrich Orders with Real-Time Constraints
    const enrichedOrders = await Promise.all(
      orders.map(async (order) => {
        const specs = specsMap[order.fruit_variant];
        if (!specs) throw new Error(`Missing specs for ${order.fruit_variant}`);

        // Resolve Coordinates
        let pLat = order.pickup_lat,
          pLng = order.pickup_lng;
        let dLat = order.drop_lat,
          dLng = order.drop_lng;

        if (!pLat) {
          const city =
            SRI_LANKA_CITIES[(order.pickup_location || "").toLowerCase()];
          if (city) {
            pLat = city.lat;
            pLng = city.lng;
          }
        }
        if (!dLat) {
          const city =
            SRI_LANKA_CITIES[(order.drop_location || "").toLowerCase()];
          if (city) {
            dLat = city.lat;
            dLng = city.lng;
          }
        }

        // Calculate Real Distance & Weather
        const distance = calculateDistanceKm(pLat, pLng, dLat, dLng);
        // Use Pickup location for weather checks
        const weather = await getRealWeather(pLat, pLng);

        // Determine Vehicle Requirement
        let reqType = "UNCOVERED";
        let reason = "Optimal";

        if (specs.force_refrigeration) {
          reqType = "REFRIGERATED";
          reason = "Product Requirement";
        } else if (weather.temp_c > specs.max_safe_temp_c) {
          reqType = "REFRIGERATED";
          reason = `Heat (${weather.temp_c}°C)`;
        } else if (distance > specs.max_dist_uncooled_km) {
          reqType = "REFRIGERATED";
          reason = `Distance (${distance}km)`;
        } else if (weather.raining) {
          reqType = "COVERED";
          reason = "Rain";
        }

        return {
          ...order,
          _algo: { distance, weather, reqType, reason, pLat, pLng, dLat, dLng },
        };
      })
    );

    // 4. Group Orders by Variant & Strictness
    let groups = {};

    enrichedOrders.forEach((o) => {
      const key = o.fruit_variant;
      if (!groups[key])
        groups[key] = { items: [], totalWeight: 0, strictType: "UNCOVERED" };

      groups[key].items.push(o);
      groups[key].totalWeight += o.quantity;

      // Escalate group requirement if any single order needs it
      const currentReq = groups[key].strictType;
      const newReq = o._algo.reqType;

      if (newReq === "REFRIGERATED") {
        groups[key].strictType = "REFRIGERATED";
      } else if (newReq === "COVERED" && currentReq !== "REFRIGERATED") {
        groups[key].strictType = "COVERED";
      }
    });

    // 5. Get Available Fleet
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

    let { data: fleet } = await vehicleQuery;
    print(`Fleet available: ${fleet.length}`);

    // 6. Assign Vehicles (Bin Packing)
    const createdJobs = [];

    for (const [variant, group] of Object.entries(groups)) {
      let remainingOrders = [...group.items];

      while (remainingOrders.length > 0) {
        // Determine acceptable vehicle types based on strictness
        let acceptableTypes = [];
        if (group.strictType === "REFRIGERATED")
          acceptableTypes = ["REFRIGERATED"];
        else if (group.strictType === "COVERED")
          acceptableTypes = ["COVERED", "REFRIGERATED"];
        else acceptableTypes = ["UNCOVERED", "COVERED", "REFRIGERATED"];

        // Filter and Sort Fleet
        let candidates = fleet.filter((v) =>
          acceptableTypes.includes(v.vehicle_type)
        );

        candidates.sort((a, b) => {
          // Prioritize exact type match to save cost, then capacity
          const typeScore = (t) =>
            t === "REFRIGERATED" ? 2 : t === "COVERED" ? 1 : 0;
          const reqScore =
            group.strictType === "REFRIGERATED"
              ? 2
              : group.strictType === "COVERED"
              ? 1
              : 0;

          const diffA = Math.abs(typeScore(a.vehicle_type) - reqScore);
          const diffB = Math.abs(typeScore(b.vehicle_type) - reqScore);

          if (diffA !== diffB) return diffA - diffB;
          return b.capacity_kg - a.capacity_kg;
        });

        const vehicle = candidates[0];

        if (!vehicle) {
          print(
            `Alert: No suitable vehicle for ${variant} (Req: ${group.strictType})`
          );
          break;
        }

        // Fill Vehicle
        let currentLoad = 0;
        let assignedIds = [];
        let jobOrders = [];
        let nextRoundOrders = [];

        remainingOrders.forEach((o) => {
          if (currentLoad + o.quantity <= vehicle.capacity_kg) {
            currentLoad += o.quantity;
            assignedIds.push(o.id);
            jobOrders.push(o);
          } else {
            nextRoundOrders.push(o);
          }
        });

        if (assignedIds.length === 0) {
          print(`Error: Order exceeds max fleet capacity.`);
          break;
        }

        // Generate Optimized Route
        const optimizerInput = jobOrders.map((o) => ({
          ...o,
          pickup_lat: o._algo.pLat,
          pickup_lng: o._algo.pLng,
          drop_lat: o._algo.dLat,
          drop_lng: o._algo.dLng,
        }));

        const optimizedRoute = optimizeManifest(
          optimizerInput,
          vehicle.current_lat,
          vehicle.current_lng
        );

        // Commit Job
        const { data: jobData } = await supabase
          .from("transport_jobs")
          .insert({
            job_date: targetDate,
            vehicle_id: vehicle.id,
            vehicle_type_assigned: vehicle.vehicle_type,
            route_name: `${variant} - ${group.strictType} Run`,
            total_weight_kg: currentLoad,
            route_manifest: optimizedRoute,
            status: "SCHEDULED",
          })
          .select()
          .single();

        await supabase
          .from("orders")
          .update({ status: "assigned", assigned_job_id: jobData.id })
          .in("id", assignedIds);

        print(
          `-> Assigned ${vehicle.vehicle_license_plate} (${currentLoad}kg)`
        );

        createdJobs.push(jobData);
        fleet = fleet.filter((v) => v.id !== vehicle.id);
        remainingOrders = nextRoundOrders;
      }
    }

    res.json({ success: true, jobs: createdJobs, logs });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
};
