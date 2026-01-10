const { supabase } = require("../../utils/supabaseClient");

// GET /api/transporter/jobs
// exports.getMyJobs = async (req, res) => {
//   try {
//     const userId = req.user.id; // From authMiddleware

//     console.log("Fetching jobs for transporter user ID:", userId);

//     const { data: vehicleData, error: vError } = await supabase
//       .from("transporter")
//       .select("vehicle_id")
//       .eq("user_id", userId) // Assuming vehicle is linked to the user directly or via transporter table
//       .single();

//     console.log("Vehicle data fetched:", vehicleData);

//     // NOTE: If your relation is User -> Transporter Table -> Vehicle, adjust accordingly:
//     // const { data: transporter } = await supabase.from('transporter').select('id').eq('user_id', userId).single();
//     // const { data: vehicleData } = await supabase.from('vehicles').select('*').eq('transporter_id', transporter.id).single();

//     if (vError || !vehicleData) {
//       return res
//         .status(404)
//         .json({ message: "No vehicle assigned to this user." });
//     }

//     // 2. Fetch Active Jobs for this vehicle
//     const { data: jobs, error: jobError } = await supabase
//       .from("transport_jobs")
//       .select("*")
//       .eq("vehicle_id", vehicleData.vehicle_id)
//       .neq("status", "COMPLETED") // Hide completed history for now
//       .order("job_date", { ascending: true });

//     console.log("Jobs fetched for vehicle:", jobs);

//     if (jobError) throw jobError;

//     res.json({ vehicle: vehicleData, jobs });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ message: "Server error fetching jobs" });
//   }
// };

exports.getMyJobs = async (req, res) => {
  try {
    const userId = req.user.id;
    console.log("Fetching jobs for transporter user ID:", userId);

    // 1. Get the Vehicle ID assigned to this Transporter
    const { data: transporterEntry, error: tError } = await supabase
      .from("transporter")
      .select("vehicle_id")
      .eq("user_id", userId)
      .single();

    if (tError || !transporterEntry || !transporterEntry.vehicle_id) {
      return res
        .status(404)
        .json({ message: "No vehicle assigned to this user." });
    }

    const vehicleId = transporterEntry.vehicle_id;

    // 2. Fetch Full Vehicle Details (License Plate is needed for Frontend)
    const { data: vehicleData, error: vError } = await supabase
      .from("vehicles")
      .select("*")
      .eq("id", vehicleId)
      .single();

    if (vError) throw vError;

    // 3. Fetch Active Jobs
    const { data: jobs, error: jobError } = await supabase
      .from("transport_jobs")
      .select("*")
      .eq("vehicle_id", vehicleId)
      .neq("status", "COMPLETED")
      .order("job_date", { ascending: true });

    if (jobError) throw jobError;

    // 4. (NEW) Fetch Unread Alerts for this Vehicle
    const { data: alerts, error: alertError } = await supabase
      .from("alerts")
      .select("*")
      .eq("vehicle_id", vehicleId)
      .eq("is_read", false)
      .order("created_at", { ascending: false });

    if (alertError) throw alertError;

    console.log(`Fetched: ${jobs.length} jobs, ${alerts.length} alerts`);

    // Return everything needed for the dashboard
    res.json({
      vehicle: vehicleData,
      jobs,
      alerts,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error fetching jobs" });
  }
};

// GET /api/transporter/jobs/:id
exports.getJobDetails = async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Fetch the Job Details
    const { data: job, error: jobError } = await supabase
      .from("transport_jobs")
      .select("*")
      .eq("id", id)
      .single();

    if (jobError || !job) {
      return res.status(404).json({ message: "Job not found" });
    }

    // 2. Extract Order IDs from the Manifest
    // Manifest structure: [{ order_id: "...", ... }, ...]
    const manifest = job.route_manifest || [];
    const orderIds = [...new Set(manifest.map((item) => item.order_id))];

    if (orderIds.length === 0) {
      return res.json({ ...job, orders_data: {} });
    }

    // 3. Fetch Order Details (Join with Users for Farmer/Buyer)
    // We assume 'users' table has 'name' and 'phone' columns as requested.
    // Note: Supabase syntax for foreign key joins: table!fk_name(cols)
    const { data: orders, error: orderError } = await supabase
      .from("orders")
      .select(
        `
        id, fruit_type, fruit_variant, quantity,
        farmer:farmer_id ( name, phone ),
        buyer:buyer_id ( name, phone )
      `
      )
      .in("id", orderIds);

    if (orderError) throw orderError;

    // 4. Fetch Fruit Specs (Based on variants found in orders)
    const variants = [...new Set(orders.map((o) => o.fruit_variant))];

    const { data: specs, error: specError } = await supabase
      .from("fruit_specs")
      .select(
        "variant_name, optimal_temp_c, max_safe_temp_c, force_refrigeration"
      )
      .in("variant_name", variants);

    if (specError) throw specError;

    // 5. Combine Data into a Lookup Map
    // Structure: { "ORDER_ID": { ...orderData, specs: { ...specData } } }
    const ordersData = {};

    orders.forEach((order) => {
      // Find matching spec
      const spec = specs.find((s) => s.variant_name === order.fruit_variant);

      ordersData[order.id] = {
        ...order,
        specs: spec || null,
      };
    });

    // Return Job + The enriched Order Data map
    res.json({
      ...job,
      orders_data: ordersData,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error fetching job details" });
  }
};
