// controllers/telemetryController.js
const { supabase } = require("../supabaseClient");

exports.updateTelemetry = async (req, res) => {
  const { vehicle_id, temp, humidity } = req.body;

  try {
    // 1. Update Vehicle "Live" Data
    await supabase
      .from("vehicles")
      .update({
        current_temp: temp,
        current_humidity: humidity,
        last_telemetry_at: new Date(),
      })
      .eq("id", vehicle_id);

    // 2. RUN SAFETY CHECKS
    await checkTemperatureSafety(vehicle_id, temp);

    res.json({ status: "success", temp });
  } catch (error) {
    console.error("Telemetry Error:", error);
    res.status(500).json({ error: error.message });
  }
};

async function checkTemperatureSafety(vehicleId, currentTemp) {
  // A. Get Active Orders on this Vehicle
  const { data: jobs } = await supabase
    .from("transport_jobs")
    .select("route_manifest")
    .eq("vehicle_id", vehicleId)
    .neq("status", "COMPLETED");

  if (!jobs?.length) return;

  const orderIds = [...new Set(jobs[0].route_manifest.map((m) => m.order_id))];

  // B. Get Specs for these orders
  const { data: orders } = await supabase
    .from("orders")
    .select(`id, fruit_variant`)
    .in("id", orderIds);

  if (!orders?.length) return;

  const variants = [...new Set(orders.map((o) => o.fruit_variant))];
  const { data: specs } = await supabase
    .from("fruit_specs")
    .select("*")
    .in("variant_name", variants);

  // C. CHECK AND INSERT ALERT
  for (const order of orders) {
    const spec = specs.find((s) => s.variant_name === order.fruit_variant);
    if (!spec) continue;

    if (currentTemp > spec.max_safe_temp_c) {
      console.log(`[ALERT] High Temp on Order ${order.id}`);

      // *** THIS INSERT TRIGGERS THE REALTIME NOTIFICATION ***
      await supabase.from("alerts").insert({
        vehicle_id: vehicleId,
        order_id: order.id,
        alert_type: "HIGH_TEMP",
        message: `CRITICAL: ${order.fruit_variant} is at ${currentTemp}°C (Max: ${spec.max_safe_temp_c}°C)`,
        value_at_time: currentTemp,
      });
    }
  }
}
