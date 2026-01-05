// controllers/batchController.js
const { supabase } = require("../../utils/supabaseClient");
const { optimizeManifest } = require("../../utils/routeOptimizer");

exports.runDailyBatch = async (req, res) => {
  // 1. INPUT: Date to plan for
  const { targetDate } = req.body; // e.g., "2025-01-20"
  const logs = [];
  const print = (m) => {
    console.log(m);
    logs.push(m);
  };

  print(`=== 🗓️ RUNNING BATCH FOR: ${targetDate} ===`);

  try {
    // --- A. GET PENDING ORDERS ---
    const { data: orders } = await supabase
      .from("orders")
      .select("*")
      .eq("status", "pending")
      .eq("pickup_date", targetDate);

    if (!orders || orders.length === 0)
      return res.json({ message: "No orders found." });
    print(`[DATA] Found ${orders.length} pending orders.`);

    // --- B. GET AVAILABLE VEHICLES (Not busy on targetDate) ---
    // Get IDs of vehicles already booked for this date
    const { data: busyJobs } = await supabase
      .from("transport_jobs")
      .select("vehicle_id")
      .eq("job_date", targetDate);

    const busyIds = busyJobs.map((j) => j.vehicle_id);

    // Fetch vehicles including their coordinates
    let vehicleQuery = supabase
      .from("vehicles")
      .select("*") // Ensure this selects current_lat, current_lng
      .eq("status", "AVAILABLE");

    if (busyIds.length > 0)
      vehicleQuery = vehicleQuery.not("id", "in", `(${busyIds.join(",")})`);

    let { data: fleet } = await vehicleQuery;
    print(`[FLEET] ${fleet.length} vehicles available for today.`);

    // --- C. GROUP ORDERS (By Variant/Requirement) ---
    // For simplicity: Group by 'fruit_variant'
    let groups = {};
    orders.forEach((o) => {
      const key = o.fruit_variant; // e.g., 'MANGO_TJC'
      if (!groups[key])
        groups[key] = { items: [], totalWeight: 0, requiredType: "UNCOVERED" };

      groups[key].items.push(o);
      groups[key].totalWeight += o.quantity;

      // Simple Logic: If TJC, force Refrigerated
      if (key === "MANGO_TJC") groups[key].requiredType = "REFRIGERATED";
      else groups[key].requiredType = "COVERED"; // Default for others
    });

    // --- D. ASSIGNMENT LOOP (Bin Packing) ---
    const createdJobs = [];

    for (const [variant, group] of Object.entries(groups)) {
      print(
        `[PLANNING] Group ${variant}: ${group.totalWeight}kg. Need: ${group.requiredType}`
      );

      let remainingOrders = [...group.items];

      // Loop until all orders in this group are assigned or we run out of trucks
      while (remainingOrders.length > 0) {
        // 1. Find Best Truck
        // Filter by Type
        let candidates = fleet.filter((v) => {
          if (group.requiredType === "REFRIGERATED")
            return v.vehicle_type === "REFRIGERATED";
          return true; // Simple fallback
        });

        // Sort by Capacity (Largest first to fit more)
        candidates.sort((a, b) => b.capacity_kg - a.capacity_kg);
        const vehicle = candidates[0];

        if (!vehicle) {
          print(`[ALERT] No suitable vehicle for remainder of ${variant}`);
          break;
        }

        // 2. Fill Truck
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
          // Current smallest order is bigger than truck? Skip.
          print(`[ERROR] Order too big for available truck.`);
          break;
        }

        // 3. Optimize Route (UPDATED)
        print(
          `   -> Assigning ${vehicle.vehicle_license_plate} (${currentLoad}/${vehicle.capacity_kg}kg)`
        );

        // *** HERE IS THE UPDATE: Pass vehicle start location ***
        const optimizedRoute = optimizeManifest(
          jobOrders,
          vehicle.current_lat,
          vehicle.current_lng
        );

        // 4. Save Job
        const { data: jobData, error: jobErr } = await supabase
          .from("transport_jobs")
          .insert({
            job_date: targetDate,
            vehicle_id: vehicle.id,
            vehicle_type_assigned: vehicle.vehicle_type,
            route_name: `${variant} Collection`,
            total_weight_kg: currentLoad,
            route_manifest: optimizedRoute,
            status: "SCHEDULED",
          })
          .select()
          .single();

        if (!jobErr) {
          // Update Orders
          await supabase
            .from("orders")
            .update({ status: "assigned", assigned_job_id: jobData.id })
            .in("id", assignedIds);

          createdJobs.push(jobData);

          // Remove vehicle from fleet so it's not used again this loop
          fleet = fleet.filter((v) => v.id !== vehicle.id);
        }

        remainingOrders = nextRoundOrders;
      }
    }

    res.json({ success: true, jobs: createdJobs, logs });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
};
