const { supabase } = require("../../utils/supabaseClient");
const {
  runAllocationEngine,
} = require("../../services/logisticsEngine/allocationEngine");

exports.runDailyBatch = async (req, res) => {
  const { targetDate } = req.body;
  const logs = [];
  const print = (m) => {
    console.log(m);
    logs.push(m);
  };

  print(
    `[BATCH START] Initiating Advanced Logistics Pipeline for: ${targetDate}`,
  );

  try {
    // 1. PULL DATA FROM DATABASE
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

    // 2. RUN THE ALGORITHM ENGINE
    print(
      `[ENGINE] Handing off ${orders.length} orders and ${availableFleet.length} vehicles to the Allocation Engine...`,
    );
    const engineResult = await runAllocationEngine(
      orders,
      availableFleet,
      specsMap,
      targetDate,
      print,
    );

    // 3. COMMIT RESULTS TO DATABASE
    const finalJobs = [];
    const allEngineJobs = [
      ...engineResult.scheduledJobs,
      ...engineResult.overflowJobs,
    ];

    for (const jobData of allEngineJobs) {
      // Extract the temp array the engine used to track orders, then remove it so it doesn't break Supabase inserts
      const orderIds = jobData.__assignedOrderIds;
      delete jobData.__assignedOrderIds;

      // Insert Job
      const { data: savedJob, error: jobError } = await supabase
        .from("transport_jobs")
        .insert(jobData)
        .select()
        .single();
      if (jobError) throw jobError;

      // Update Orders
      await supabase
        .from("orders")
        .update({ status: "assigned", assigned_job_id: savedJob.id })
        .in("id", orderIds);

      finalJobs.push(savedJob);
    }

    print(
      `[BATCH COMPLETE] Engine successfully generated ${finalJobs.length} manifests across ${engineResult.wavesProcessed} waves.`,
    );
    res.json({ success: true, jobs: finalJobs, logs });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message, logs });
  }
};
