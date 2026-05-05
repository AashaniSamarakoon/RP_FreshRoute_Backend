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

  console.log(
    `[Telemetry Debug] Checking temperature safety for vehicle ${vehicleId} with reading ${currentTemp}°C`,
  );

  if (!telemetryHistory.has(vehicleId)) {
    telemetryHistory.set(vehicleId, []);
    console.log(
      `[Telemetry Debug] Created telemetry history buffer for vehicle ${vehicleId}`,
    );
  }

  let history = telemetryHistory.get(vehicleId);

  // Add new reading
  history.push({ temp: currentTemp, timestamp: now });

  // Remove readings older than our 5-minute window
  history = history.filter((reading) => now - reading.timestamp <= windowMs);
  telemetryHistory.set(vehicleId, history);

  console.log(
    `[Telemetry Debug] Vehicle ${vehicleId} has ${history.length} reading(s) inside the ${WINDOW_MINUTES}-minute window`,
  );

  if (history.length < 2) {
    console.log(
      `[Telemetry Debug] Skipping alert evaluation for ${vehicleId}: need at least 2 readings, found ${history.length}`,
    );
    return;
  }

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

  console.log(
    `[Telemetry Debug] transport_jobs lookup for ${vehicleId}: ${jobs?.length || 0} job(s) found`,
  );

  if (!jobs?.length) {
    console.log(
      `[Telemetry Debug] No transport jobs found for vehicle ${vehicleId}; cannot evaluate order-based alerts`,
    );
    return;
  }

  const routeManifest = jobs[0].route_manifest || [];
  console.log(
    `[Telemetry Debug] Using first job route manifest for ${vehicleId}: ${routeManifest.length} stop(s)`,
  );

  const orderIds = [
    ...new Set(routeManifest.map((m) => m.order_id).filter(Boolean)),
  ];

  console.log(
    `[Telemetry Debug] Extracted ${orderIds.length} unique order id(s) from route manifest for ${vehicleId}: ${orderIds.join(", ") || "none"}`,
  );

  if (!orderIds.length) {
    console.log(
      `[Telemetry Debug] Route manifest for vehicle ${vehicleId} contains no valid order IDs; skipping alert generation`,
    );
    return;
  }

  const { data: orders } = await supabase
    .from("orders")
    .select(`id, fruit_variant, placed_order_id`)
    .in("id", orderIds);

  console.log(`order Ids used for lookup: ${orderIds.join(", ")}`);

  console.log(
    `[Telemetry Debug] orders lookup for ${vehicleId}: ${orders?.length || 0} order(s) found`,
  );

  if (!orders?.length) {
    console.log(
      `[Telemetry Debug] No matching orders found for vehicle ${vehicleId} using route manifest order IDs`,
    );
    return;
  }

  const variants = [...new Set(orders.map((o) => o.fruit_variant))];
  console.log(
    `[Telemetry Debug] Fruit variants for vehicle ${vehicleId}: ${variants.join(", ")}`,
  );

  const { data: specs } = await supabase
    .from("fruit_specs")
    .select("*")
    .in("variant_name", variants);

  console.log(
    `[Telemetry Debug] fruit_specs lookup for ${vehicleId}: ${specs?.length || 0} spec row(s) found`,
  );

  for (const order of orders) {
    const spec = specs.find((s) => s.variant_name === order.fruit_variant);
    if (!spec) {
      console.log(
        `[Telemetry Debug] Missing fruit spec for order ${order.id} variant ${order.fruit_variant}; skipping order`,
      );
      continue;
    }

    console.log(
      `[Telemetry Debug] Evaluating order ${order.id}: avgTemp=${avgTemp.toFixed(2)}°C, maxSafe=${spec.max_safe_temp_c}°C, optimal=${spec.optimal_temp_c}°C`,
    );

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
    } else {
      console.log(
        `[Telemetry Debug] No alert for order ${order.id}: avgTemp ${avgTemp.toFixed(2)}°C is within max safe ${spec.max_safe_temp_c}°C`,
      );
    }
  }
}
