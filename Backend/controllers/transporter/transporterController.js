// const { supabase } = require("../../utils/supabaseClient");

// exports.getMyJobs = async (req, res) => {
//   try {
//     const userId = req.user.id;
//     console.log("Fetching jobs for transporter user ID:", userId);

//     // 1. Get the Vehicle ID assigned to this Transporter
//     const { data: transporterEntry, error: tError } = await supabase
//       .from("transporter")
//       .select("vehicle_id")
//       .eq("user_id", userId)
//       .single();

//     if (tError || !transporterEntry || !transporterEntry.vehicle_id) {
//       return res
//         .status(404)
//         .json({ message: "No vehicle assigned to this user." });
//     }

//     const vehicleId = transporterEntry.vehicle_id;

//     // 2. Fetch Full Vehicle Details (License Plate is needed for Frontend)
//     const { data: vehicleData, error: vError } = await supabase
//       .from("vehicles")
//       .select("*")
//       .eq("id", vehicleId)
//       .single();

//     if (vError) throw vError;

//     // 3. Fetch Active Jobs
//     const { data: jobs, error: jobError } = await supabase
//       .from("transport_jobs")
//       .select("*")
//       .eq("vehicle_id", vehicleId)
//       .neq("status", "COMPLETED")
//       .order("job_date", { ascending: true });

//     if (jobError) throw jobError;

//     // 4. (NEW) Fetch Unread Alerts for this Vehicle
//     const { data: alerts, error: alertError } = await supabase
//       .from("alerts")
//       .select("*")
//       .eq("vehicle_id", vehicleId)
//       .eq("is_read", false)
//       .order("created_at", { ascending: false });

//     if (alertError) throw alertError;

//     console.log(`Fetched: ${jobs.length} jobs, ${alerts.length} alerts`);

//     // Return everything needed for the dashboard
//     res.json({
//       vehicle: vehicleData,
//       jobs,
//       alerts,
//     });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ message: "Server error fetching jobs" });
//   }
// };

// // GET /api/transporter/jobs/:id
// exports.getJobDetails = async (req, res) => {
//   try {
//     const { id } = req.params;

//     // 1. Fetch the Job Details
//     const { data: job, error: jobError } = await supabase
//       .from("transport_jobs")
//       .select("*")
//       .eq("id", id)
//       .single();

//     if (jobError || !job) {
//       return res.status(404).json({ message: "Job not found" });
//     }

//     // 2. Extract Order IDs from the Manifest
//     // Manifest structure: [{ order_id: "...", ... }, ...]
//     const manifest = job.route_manifest || [];
//     const orderIds = [...new Set(manifest.map((item) => item.order_id))];

//     if (orderIds.length === 0) {
//       return res.json({ ...job, orders_data: {} });
//     }

//     // 3. Fetch Order Details
//     // Removed implicit join syntax because farmer_id and buyer_id lack foreign keys in the schema.
//     const { data: orders, error: orderError } = await supabase
//       .from("orders")
//       .select("id, fruit_type, fruit_variant, quantity, farmer_id, buyer_id")
//       .in("id", orderIds);

//     if (orderError) throw orderError;

//     // 3.5. Fetch Users for Farmers and Buyers
//     const userIds = [
//       ...new Set([
//         ...orders.map((o) => o.farmer_id).filter(Boolean),
//         ...orders.map((o) => o.buyer_id).filter(Boolean),
//       ]),
//     ];

//     let usersMap = {};
//     if (userIds.length > 0) {
//       const { data: users, error: usersError } = await supabase
//         .from("users")
//         .select("id, first_name, last_name, phone")
//         .in("id", userIds);

//       if (usersError) throw usersError;

//       users.forEach((u) => {
//         usersMap[u.id] = {
//           name: `${u.first_name || ""} ${u.last_name || ""}`.trim(),
//           phone: u.phone,
//         };
//       });
//     }

//     // 4. Fetch Fruit Specs (Based on variants found in orders)
//     const variants = [
//       ...new Set(orders.map((o) => o.fruit_variant).filter(Boolean)),
//     ];

//     let specs = [];
//     if (variants.length > 0) {
//       const { data: specsData, error: specError } = await supabase
//         .from("fruit_specs")
//         .select(
//           "variant_name, optimal_temp_c, max_safe_temp_c, force_refrigeration, handling_guidelines",
//         )
//         .in("variant_name", variants);

//       if (specError) throw specError;
//       specs = specsData || [];
//     }

//     // 5. Combine Data into a Lookup Map
//     // Structure: { "ORDER_ID": { ...orderData, specs: { ...specData } } }
//     const ordersData = {};

//     orders.forEach((order) => {
//       // Find matching spec
//       const spec = specs.find((s) => s.variant_name === order.fruit_variant);

//       ordersData[order.id] = {
//         id: order.id,
//         fruit_type: order.fruit_type,
//         fruit_variant: order.fruit_variant,
//         quantity: order.quantity,
//         farmer: usersMap[order.farmer_id] || null,
//         buyer: usersMap[order.buyer_id] || null,
//         specs: spec || null,
//       };
//     });

//     // Return Job + The enriched Order Data map
//     res.json({
//       ...job,
//       orders_data: ordersData,
//     });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ message: "Server error fetching job details" });
//   }
// };

// // POST /api/transporter/jobs/:id/action
// exports.updateJobAction = async (req, res) => {
//   try {
//     const { id: jobId } = req.params;
//     const { orderId, type } = req.body; // type should be 'PICKUP' or 'DROP'

//     // 1. Fetch current job
//     const { data: job, error: jobError } = await supabase
//       .from("transport_jobs")
//       .select("route_manifest, status")
//       .eq("id", jobId)
//       .single();

//     if (jobError || !job) {
//       return res.status(404).json({ message: "Job not found" });
//     }

//     let manifest = job.route_manifest || [];
//     let itemUpdated = false;

//     // 2. Update the specific manifest item
//     manifest = manifest.map((item) => {
//       if (item.order_id === orderId && item.type === type) {
//         itemUpdated = true;
//         return {
//           ...item,
//           is_completed: true,
//           completed_at: new Date().toISOString(),
//         };
//       }
//       return item;
//     });

//     if (!itemUpdated) {
//       return res
//         .status(400)
//         .json({ message: "Matching manifest item not found." });
//     }

//     // 3. Check if the entire job is finished
//     const allCompleted = manifest.every((item) => item.is_completed === true);
//     const newJobStatus = allCompleted ? "COMPLETED" : job.status;

//     // 4. Save the updated manifest back to transport_jobs
//     const { error: updateJobError } = await supabase
//       .from("transport_jobs")
//       .update({
//         route_manifest: manifest,
//         status: newJobStatus,
//       })
//       .eq("id", jobId);

//     if (updateJobError) throw updateJobError;

//     // 5. If it's a DROP action, mark the actual Order as completed
//     if (type === "DROP") {
//       const { error: orderError } = await supabase
//         .from("orders")
//         .update({ status: "completed" })
//         .eq("id", orderId);

//       if (orderError) throw orderError;
//     }

//     res.json({
//       success: true,
//       message: `Successfully confirmed ${type}`,
//       manifest,
//       jobStatus: newJobStatus,
//     });
//   } catch (err) {
//     console.error("Error updating job action:", err);
//     res.status(500).json({ message: "Server error processing action" });
//   }
// };

// // POST /api/transporter/location
// exports.updateLocation = async (req, res) => {
//   try {
//     const userId = req.user.id;
//     const { lat, lng } = req.body;

//     // Validate input
//     if (lat === undefined || lng === undefined) {
//       return res
//         .status(400)
//         .json({ message: "Latitude and longitude are required." });
//     }

//     // 1. Get the Vehicle ID assigned to this Transporter
//     const { data: transporterEntry, error: tError } = await supabase
//       .from("transporter")
//       .select("vehicle_id")
//       .eq("user_id", userId)
//       .single();

//     if (tError || !transporterEntry || !transporterEntry.vehicle_id) {
//       return res
//         .status(404)
//         .json({ message: "No vehicle assigned to this user." });
//     }

//     const vehicleId = transporterEntry.vehicle_id;

//     // 2. Update the vehicle's location and timestamp
//     const { error: updateError } = await supabase
//       .from("vehicles")
//       .update({
//         current_lat: parseFloat(lat),
//         current_lng: parseFloat(lng),
//         updated_at: new Date().toISOString(),
//       })
//       .eq("id", vehicleId);

//     if (updateError) throw updateError;

//     res.json({
//       success: true,
//       message: "Location updated successfully",
//       data: { lat, lng },
//     });
//   } catch (err) {
//     console.error("Error updating vehicle location:", err);
//     res.status(500).json({ message: "Server error updating location" });
//   }
// };

// exports.getVehicleDetails = async (req, res) => {
//   try {
//     const userId = req.user.id;
//     console.log("Fetching vehicle details for transporter user ID:", userId);

//     // 1. Get the Vehicle ID assigned to this Transporter
//     const { data: transporterEntry, error: tError } = await supabase
//       .from("transporter")
//       .select("vehicle_id")
//       .eq("user_id", userId)
//       .single();

//     if (tError || !transporterEntry || !transporterEntry.vehicle_id) {
//       return res
//         .status(404)
//         .json({ message: "No vehicle assigned to this user." });
//     }

//     const vehicleId = transporterEntry.vehicle_id;

//     // 2. Fetch the vehicle details
//     const { data: vehicleDetails, error: vError } = await supabase
//       .from("vehicles")
//       .select("*")
//       .eq("id", vehicleId)
//       .single();

//     if (vError || !vehicleDetails) {
//       return res.status(404).json({ message: "Vehicle not found." });
//     }

//     res.json({
//       success: true,
//       data: vehicleDetails,
//     });
//   } catch (err) {
//     console.error("Error fetching vehicle details:", err);
//     res.status(500).json({ message: "Server error fetching vehicle details" });
//   }
// };

// exports.updateJobStatus = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const { status } = req.body; // "IN_TRANSIT" or "COMPLETED"

//     const { error } = await supabase
//       .from("transport_jobs")
//       .update({ status })
//       .eq("id", id);

//     if (error) throw error;
//     res.json({ success: true, message: "Job status updated" });
//   } catch (err) {
//     res.status(500).json({ message: "Server error updating status" });
//   }
// };

const { supabase } = require("../../utils/supabaseClient");

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

    // GRACEFUL HANDLING: Return 200 with empty arrays instead of an error
    if (tError || !transporterEntry || !transporterEntry.vehicle_id) {
      return res.status(200).json({
        vehicle: null,
        jobs: [],
        alerts: [],
        message: "No vehicle assigned to this user.",
      });
    }

    const vehicleId = transporterEntry.vehicle_id;

    // 2. Fetch Full Vehicle Details (License Plate is needed for Frontend)
    const { data: vehicleData, error: vError } = await supabase
      .from("vehicles")
      .select("*")
      .eq("id", vehicleId)
      .single();

    if (vError) throw vError;

    // 3. Fetch ALL Jobs (Updated to fetch everything so the History tab works)
    const { data: jobs, error: jobError } = await supabase
      .from("transport_jobs")
      .select("*")
      .eq("vehicle_id", vehicleId)
      .order("job_date", { ascending: false });

    if (jobError) throw jobError;

    // 4. Fetch Unread Alerts for this Vehicle
    const { data: alerts, error: alertError } = await supabase
      .from("alerts")
      .select("*")
      .eq("vehicle_id", vehicleId)
      .eq("is_read", false)
      .order("created_at", { ascending: false });

    if (alertError) throw alertError;

    console.log(`Fetched: ${jobs.length} jobs, ${alerts.length} alerts`);

    // Return everything needed for the dashboard
    res.status(200).json({
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
    const manifest = job.route_manifest || [];
    const orderIds = [...new Set(manifest.map((item) => item.order_id))];

    if (orderIds.length === 0) {
      return res.json({ ...job, orders_data: {} });
    }

    // 3. Fetch Order Details
    const { data: orders, error: orderError } = await supabase
      .from("orders")
      .select("id, fruit_type, fruit_variant, quantity, farmer_id, buyer_id")
      .in("id", orderIds);

    if (orderError) throw orderError;

    // 3.5. Fetch Users for Farmers and Buyers
    const userIds = [
      ...new Set([
        ...orders.map((o) => o.farmer_id).filter(Boolean),
        ...orders.map((o) => o.buyer_id).filter(Boolean),
      ]),
    ];

    let usersMap = {};
    if (userIds.length > 0) {
      const { data: users, error: usersError } = await supabase
        .from("users")
        .select("id, first_name, last_name, phone")
        .in("id", userIds);

      if (usersError) throw usersError;

      users.forEach((u) => {
        usersMap[u.id] = {
          name: `${u.first_name || ""} ${u.last_name || ""}`.trim(),
          phone: u.phone,
        };
      });
    }

    // 4. Fetch Fruit Specs
    const variants = [
      ...new Set(orders.map((o) => o.fruit_variant).filter(Boolean)),
    ];

    let specs = [];
    if (variants.length > 0) {
      const { data: specsData, error: specError } = await supabase
        .from("fruit_specs")
        .select(
          "variant_name, optimal_temp_c, max_safe_temp_c, force_refrigeration, handling_guidelines",
        )
        .in("variant_name", variants);

      if (specError) throw specError;
      specs = specsData || [];
    }

    // 5. Combine Data into a Lookup Map
    const ordersData = {};

    orders.forEach((order) => {
      const spec = specs.find((s) => s.variant_name === order.fruit_variant);

      ordersData[order.id] = {
        id: order.id,
        fruit_type: order.fruit_type,
        fruit_variant: order.fruit_variant,
        quantity: order.quantity,
        farmer: usersMap[order.farmer_id] || null,
        buyer: usersMap[order.buyer_id] || null,
        specs: spec || null,
      };
    });

    res.json({
      ...job,
      orders_data: ordersData,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error fetching job details" });
  }
};

// POST /api/transporter/jobs/:id/action
exports.updateJobAction = async (req, res) => {
  try {
    const { id: jobId } = req.params;
    const { orderId, type } = req.body;

    // 1. Fetch current job
    const { data: job, error: jobError } = await supabase
      .from("transport_jobs")
      .select("route_manifest, status")
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      return res.status(404).json({ message: "Job not found" });
    }

    let manifest = job.route_manifest || [];
    let itemUpdated = false;

    // 2. Update the specific manifest item
    manifest = manifest.map((item) => {
      if (item.order_id === orderId && item.type === type) {
        itemUpdated = true;
        return {
          ...item,
          is_completed: true,
          completed_at: new Date().toISOString(),
        };
      }
      return item;
    });

    if (!itemUpdated) {
      return res
        .status(400)
        .json({ message: "Matching manifest item not found." });
    }

    // 3. Check if the entire job is finished
    const allCompleted = manifest.every((item) => item.is_completed === true);
    const newJobStatus = allCompleted ? "COMPLETED" : job.status;

    // 4. Save the updated manifest back to transport_jobs
    const { error: updateJobError } = await supabase
      .from("transport_jobs")
      .update({
        route_manifest: manifest,
        status: newJobStatus,
      })
      .eq("id", jobId);

    if (updateJobError) throw updateJobError;

    // 5. If it's a DROP action, mark the actual Order as completed
    if (type === "DROP") {
      const { error: orderError } = await supabase
        .from("orders")
        .update({ status: "completed" })
        .eq("id", orderId);

      if (orderError) throw orderError;
    }

    res.json({
      success: true,
      message: `Successfully confirmed ${type}`,
      manifest,
      jobStatus: newJobStatus,
    });
  } catch (err) {
    console.error("Error updating job action:", err);
    res.status(500).json({ message: "Server error processing action" });
  }
};

// POST /api/transporter/location
exports.updateLocation = async (req, res) => {
  try {
    const userId = req.user.id;
    const { lat, lng } = req.body;

    if (lat === undefined || lng === undefined) {
      return res
        .status(400)
        .json({ message: "Latitude and longitude are required." });
    }

    // 1. Get the Vehicle ID assigned to this Transporter
    const { data: transporterEntry, error: tError } = await supabase
      .from("transporter")
      .select("vehicle_id")
      .eq("user_id", userId)
      .single();

    // GRACEFUL HANDLING: Prevent background location interval from throwing 404s
    if (tError || !transporterEntry || !transporterEntry.vehicle_id) {
      return res.status(200).json({
        success: false,
        message: "Location ping ignored: No vehicle assigned.",
      });
    }

    const vehicleId = transporterEntry.vehicle_id;

    // 2. Update the vehicle's location and timestamp
    const { error: updateError } = await supabase
      .from("vehicles")
      .update({
        current_lat: parseFloat(lat),
        current_lng: parseFloat(lng),
        updated_at: new Date().toISOString(),
      })
      .eq("id", vehicleId);

    if (updateError) throw updateError;

    res.json({
      success: true,
      message: "Location updated successfully",
      data: { lat, lng },
    });
  } catch (err) {
    console.error("Error updating vehicle location:", err);
    res.status(500).json({ message: "Server error updating location" });
  }
};

exports.getVehicleDetails = async (req, res) => {
  try {
    const userId = req.user.id;
    console.log("Fetching vehicle details for transporter user ID:", userId);

    // 1. Get the Vehicle ID assigned to this Transporter
    const { data: transporterEntry, error: tError } = await supabase
      .from("transporter")
      .select("vehicle_id")
      .eq("user_id", userId)
      .single();

    // GRACEFUL HANDLING: Return 200 with null data
    if (tError || !transporterEntry || !transporterEntry.vehicle_id) {
      return res.status(200).json({
        success: true,
        data: null,
        message: "No vehicle assigned to this user.",
      });
    }

    const vehicleId = transporterEntry.vehicle_id;

    // 2. Fetch the vehicle details
    const { data: vehicleDetails, error: vError } = await supabase
      .from("vehicles")
      .select("*")
      .eq("id", vehicleId)
      .single();

    if (vError || !vehicleDetails) {
      return res
        .status(200)
        .json({ success: true, data: null, message: "Vehicle not found." });
    }

    res.json({
      success: true,
      data: vehicleDetails,
    });
  } catch (err) {
    console.error("Error fetching vehicle details:", err);
    res.status(500).json({ message: "Server error fetching vehicle details" });
  }
};

exports.updateJobStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const { error } = await supabase
      .from("transport_jobs")
      .update({ status })
      .eq("id", id);

    if (error) throw error;
    res.json({ success: true, message: "Job status updated" });
  } catch (err) {
    res.status(500).json({ message: "Server error updating status" });
  }
};
