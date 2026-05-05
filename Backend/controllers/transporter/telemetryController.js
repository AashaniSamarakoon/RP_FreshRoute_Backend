const { supabase } = require("../../utils/supabaseClient");

const telemetryHistory = new Map();

const alertCooldowns = new Map();

const WINDOW_MINUTES = 1; // Watch readings over the last 5 minutes
const COOLDOWN_MINUTES = 2; // Wait 15 minutes before sending another alert for the same vehicle

exports.updateTelemetry = async (req, res) => {
  const { vehicle_id, temp, humidity } = req.body;
  console.log(
    `Received telemetry for Vehicle ${vehicle_id}: Temp=${temp}°C, Humidity=${humidity}%`,
  );

  try {
    // 1. Update Vehicle "Live" Data in DB
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
  const now = Date.now();
  const windowMs = WINDOW_MINUTES * 60 * 1000;

  if (!telemetryHistory.has(vehicleId)) {
    telemetryHistory.set(vehicleId, []);
  }

  let history = telemetryHistory.get(vehicleId);

  // Add new reading
  history.push({ temp: currentTemp, timestamp: now });

  // Remove readings older than our 5-minute window
  history = history.filter((reading) => now - reading.timestamp <= windowMs);
  telemetryHistory.set(vehicleId, history);

  if (history.length < 2) return;

  const sumTemp = history.reduce((acc, reading) => acc + reading.temp, 0);
  const avgTemp = sumTemp / history.length;

  console.log(
    `Vehicle ${vehicleId} 5-Min Avg Temp: ${avgTemp.toFixed(2)}°C (Based on ${history.length} readings)`,
  );

  const { data: jobs } = await supabase
    .from("transport_jobs")
    .select("route_manifest")
    .eq("vehicle_id", vehicleId);
  // .eq("status", "IN_TRANSIT");

  if (!jobs?.length) return;

  const orderIds = [...new Set(jobs[0].route_manifest.map((m) => m.order_id))];

  const { data: orders } = await supabase
    .from("orders")
    .select(`id, fruit_variant, placed_order_id`)
    .in("id", orderIds);

  if (!orders?.length) return;

  const variants = [...new Set(orders.map((o) => o.fruit_variant))];
  const { data: specs } = await supabase
    .from("fruit_specs")
    .select("*")
    .in("variant_name", variants);

  for (const order of orders) {
    const spec = specs.find((s) => s.variant_name === order.fruit_variant);
    if (!spec) continue;

    if (avgTemp > spec.max_safe_temp_c) {
      // Check cooldown to prevent alert spam
      const lastAlertTime = alertCooldowns.get(vehicleId) || 0;
      const cooldownMs = COOLDOWN_MINUTES * 60 * 1000;

      if (now - lastAlertTime > cooldownMs) {
        console.log(
          `[ALERT] High Avg Temp on Order ${order.id}. Triggering Notification!`,
        );

        alertCooldowns.set(vehicleId, now);

        await supabase.from("alerts").insert({
          vehicle_id: vehicleId,
          order_id: order.id,
          alert_type: "HIGH_TEMP",
          message: `WARNING: ${order.fruit_variant} average temp over last 5 mins is ${avgTemp.toFixed(1)}°C (Max: ${spec.max_safe_temp_c}°C)`,
          value_at_time: avgTemp,
          max_safe_temp_c: spec.max_safe_temp_c,
          optimal_temp_c: spec.optimal_temp_c,
          placed_order_id: order.placed_order_id,
        });
      } else {
        const minsLeft = Math.ceil(
          (cooldownMs - (now - lastAlertTime)) / 60000,
        );
        console.log(
          `[INFO] Alert suppressed for ${vehicleId} (Cooldown: ${minsLeft}m remaining)`,
        );
      }
    }
  }
}
