// const { supabase } = require("../../utils/supabaseClient");
// const {
//   runAllocationEngine,
// } = require("../../services/logisticsEngine/allocationEngine");

// exports.runDailyBatch = async (req, res) => {
//   const { targetDate } = req.body;
//   const logs = [];
//   const print = (m) => {
//     console.log(m);
//     logs.push(m);
//   };

//   print(
//     `[BATCH START] Initiating Advanced Logistics Pipeline for: ${targetDate}`,
//   );

//   try {
//     // 1. PULL DATA FROM DATABASE
//     const { data: orders } = await supabase
//       .from("orders")
//       .select("*")
//       .eq("status", "pending")
//       .eq("pickup_date", targetDate);
//     if (!orders?.length) return res.json({ message: "No pending orders." });

//     const variants = [...new Set(orders.map((o) => o.fruit_variant))];
//     const { data: allSpecs } = await supabase
//       .from("fruit_specs")
//       .select("*")
//       .in("variant_name", variants);
//     const specsMap = allSpecs.reduce(
//       (acc, s) => ({ ...acc, [s.variant_name]: s }),
//       {},
//     );

//     const { data: busyJobs } = await supabase
//       .from("transport_jobs")
//       .select("vehicle_id")
//       .eq("job_date", targetDate);
//     const busyIds = busyJobs.map((j) => j.vehicle_id);

//     let vehicleQuery = supabase
//       .from("vehicles")
//       .select("*")
//       .eq("status", "AVAILABLE");
//     if (busyIds.length > 0)
//       vehicleQuery = vehicleQuery.not("id", "in", `(${busyIds.join(",")})`);
//     let { data: availableFleet } = await vehicleQuery;

//     // 2. RUN THE ALGORITHM ENGINE
//     print(
//       `[ENGINE] Handing off ${orders.length} orders and ${availableFleet.length} vehicles to the Allocation Engine...`,
//     );
//     const engineResult = await runAllocationEngine(
//       orders,
//       availableFleet,
//       specsMap,
//       targetDate,
//       print,
//     );

//     // 3. COMMIT RESULTS TO DATABASE
//     const finalJobs = [];
//     const allEngineJobs = [
//       ...engineResult.scheduledJobs,
//       ...engineResult.overflowJobs,
//     ];

//     for (const jobData of allEngineJobs) {
//       // Extract the temp array the engine used to track orders, then remove it so it doesn't break Supabase inserts
//       const orderIds = jobData.__assignedOrderIds;
//       delete jobData.__assignedOrderIds;

//       // Insert Job
//       const { data: savedJob, error: jobError } = await supabase
//         .from("transport_jobs")
//         .insert(jobData)
//         .select()
//         .single();
//       if (jobError) throw jobError;

//       // Update Orders
//       await supabase
//         .from("orders")
//         .update({ status: "assigned", assigned_job_id: savedJob.id })
//         .in("id", orderIds);

//       finalJobs.push(savedJob);
//     }

//     print(
//       `[BATCH COMPLETE] Engine successfully generated ${finalJobs.length} manifests across ${engineResult.wavesProcessed} waves.`,
//     );
//     res.json({ success: true, jobs: finalJobs, logs });
//   } catch (e) {
//     console.error(e);
//     res.status(500).json({ error: e.message, logs });
//   }
// };

const cron = require("node-cron");
const { supabase } = require("../../utils/supabaseClient");
const {
  runAllocationEngine,
} = require("../../services/logisticsEngine/allocationEngine");

async function processBatchForDate(targetDate) {
  const logs = [];
  const print = (m) => {
    console.log(m);
    logs.push(m);
  };

  print(`[BATCH START] Initiating Logistics Pipeline for: ${targetDate}`);

  try {
    const { data: orders } = await supabase
      .from("orders")
      .select("*")
      .eq("status", "pending")
      .eq("pickup_date", targetDate);

    if (!orders?.length) {
      print("[INFO] No pending orders found.");
      return { success: true, message: "No pending orders.", jobs: [], logs };
    }

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
    if (busyIds.length > 0) {
      vehicleQuery = vehicleQuery.not("id", "in", `(${busyIds.join(",")})`);
    }
    let { data: availableFleet } = await vehicleQuery;

    print(
      `[ENGINE] Processing ${orders.length} orders with ${availableFleet.length} vehicles...`,
    );
    const engineResult = await runAllocationEngine(
      orders,
      availableFleet,
      specsMap,
      targetDate,
      print,
    );

    const finalJobs = [];
    const allEngineJobs = [
      ...engineResult.scheduledJobs,
      ...engineResult.overflowJobs,
    ];

    for (const jobData of allEngineJobs) {
      const orderIds = jobData.__assignedOrderIds;
      delete jobData.__assignedOrderIds; // Remove temp tracker before Supabase insert

      const { data: savedJob, error: jobError } = await supabase
        .from("transport_jobs")
        .insert(jobData)
        .select()
        .single();

      if (jobError) throw jobError;

      await supabase
        .from("orders")
        .update({ status: "assigned", assigned_job_id: savedJob.id })
        .in("id", orderIds);

      finalJobs.push(savedJob);
    }

    print(`[BATCH COMPLETE] Generated ${finalJobs.length} manifests.`);

    return {
      success: true,
      jobs: finalJobs,
      logs,
      wavesProcessed: engineResult.wavesProcessed,
    };
  } catch (e) {
    console.error(e);
    return { success: false, error: e.message, logs };
  }
}

// API endpoint for manual triggers
exports.runDailyBatch = async (req, res) => {
  const { targetDate } = req.body;

  if (!targetDate) {
    return res
      .status(400)
      .json({ success: false, error: "targetDate is required." });
  }

  const result = await processBatchForDate(targetDate);

  if (result.success) {
    res.json(result);
  } else {
    res.status(500).json(result);
  }
};

// Automated daily scheduler
exports.startLogisticsCronJob = () => {
  // Runs daily at 1:00 AM server time
  cron.schedule("0 1 * * *", async () => {
    console.log("[CRON] Running Automated Logistics Batch");

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const targetDate = tomorrow.toISOString().split("T")[0];

    console.log(`[CRON] Target Date: ${targetDate}`);

    const result = await processBatchForDate(targetDate);

    if (result.success) {
      console.log(
        `[CRON SUCCESS] Allocated ${result.jobs?.length || 0} manifests.`,
      );
    } else {
      console.error(`[CRON FAILED] Error: ${result.error}`);
    }
  });

  console.log("Logistics CRON Job initialized (01:00 AM daily)");
};
