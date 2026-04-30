// test_engine.js
const {
  runAllocationEngine,
} = require("./services/logisticsEngine/allocationEngine.js");

async function runLivePanelTest() {
  console.log(
    "\n==================================================================",
  );
  console.log("STARTING AI COLD-CHAIN LOGISTICS ENGINE - LIVE TEST");
  console.log(
    "==================================================================\n",
  );

  const targetDate = "2026-03-12";

  // 1. THE TEST DATA: 10 Real Orders Scattered Across Matara District
  const testOrders = [
    {
      id: "ORD-01",
      fruit_variant: "All",
      quantity: 550,
      pickup_location: "Akuressa North Farm",
      pickup_lat: 6.105,
      pickup_lng: 80.482,
      drop_location: "Weligama Market",
      drop_lat: 5.9752,
      drop_lng: 80.4285,
    },
    {
      id: "ORD-02",
      fruit_variant: "Ambul",
      quantity: 500,
      pickup_location: "Hakmana East Estate",
      pickup_lat: 6.138,
      pickup_lng: 80.646,
      drop_location: "Weligama Bay Storage",
      drop_lat: 5.971,
      drop_lng: 80.43,
    },
    {
      id: "ORD-03",
      fruit_variant: "All",
      quantity: 650,
      pickup_location: "Deniyaya Hills Farm",
      pickup_lat: 6.3392,
      pickup_lng: 80.5647,
      drop_location: "Matara Main Market",
      drop_lat: 5.9522,
      drop_lng: 80.5376,
    },
    {
      id: "ORD-04",
      fruit_variant: "Ambul",
      quantity: 6000,
      pickup_location: "Morawaka Plantations",
      pickup_lat: 6.2828,
      pickup_lng: 80.4819,
      drop_location: "Matara Warehouse",
      drop_lat: 5.955,
      drop_lng: 80.535,
    },
    {
      id: "ORD-05",
      fruit_variant: "Ambul",
      quantity: 400,
      pickup_location: "Dickwella Coastal Farm",
      pickup_lat: 5.965,
      pickup_lng: 80.701,
      drop_location: "Weligama Port",
      drop_lat: 5.9745,
      drop_lng: 80.4245,
    },
    {
      id: "ORD-06",
      fruit_variant: "TJC",
      quantity: 300,
      pickup_location: "Hakmana West Farm",
      pickup_lat: 6.132,
      pickup_lng: 80.64,
      drop_location: "Weligama Center",
      drop_lat: 5.9736,
      drop_lng: 80.4283,
    },
    {
      id: "ORD-07",
      fruit_variant: "All",
      quantity: 1200,
      pickup_location: "Kamburupitiya Estate",
      pickup_lat: 6.0683,
      pickup_lng: 80.56,
      drop_location: "Mirissa Storage",
      drop_lat: 5.9483,
      drop_lng: 80.4536,
    },
    {
      id: "ORD-08",
      fruit_variant: "All",
      quantity: 550,
      pickup_location: "Akuressa South Farm",
      pickup_lat: 6.092,
      pickup_lng: 80.488,
      drop_location: "Weligama Beach Road",
      drop_lat: 5.977,
      drop_lng: 80.421,
    },
    {
      id: "ORD-09",
      fruit_variant: "TJC",
      quantity: 900,
      pickup_location: "Akuressa West Plantations",
      pickup_lat: 6.0995,
      pickup_lng: 80.475,
      drop_location: "Weligama Storage Facility",
      drop_lat: 5.9755,
      drop_lng: 80.4265,
    },
    {
      id: "ORD-10",
      fruit_variant: "Ambul",
      quantity: 500,
      pickup_location: "Hakmana South Estate",
      pickup_lat: 6.128,
      pickup_lng: 80.648,
      drop_location: "Weligama Station",
      drop_lat: 5.9765,
      drop_lng: 80.428,
    },
  ];

  // 2. THE FLEET: 3 Different Truck Types
  const testFleet = [
    {
      id: "TRK-REEFER-01",
      vehicle_type: "REFRIGERATED",
      capacity_kg: 5000,
      current_lat: 5.95,
      current_lng: 80.53,
    }, // Parked in Matara
    {
      id: "TRK-COVER-02",
      vehicle_type: "COVERED",
      capacity_kg: 3000,
      current_lat: 6.1,
      current_lng: 80.48,
    }, // Parked in Akuressa
    {
      id: "TRK-OPEN-03",
      vehicle_type: "UNCOVERED",
      capacity_kg: 2000,
      current_lat: 5.97,
      current_lng: 80.42,
    }, // Parked in Weligama
  ];

  // 3. SCIENTIFIC FRUIT SPECS
  const testSpecs = {
    All: {
      variant_name: "All",
      force_refrigeration: false,
      max_safe_temp_c: 32,
      min_safe_temp_c: 7,
      ethylene_producer: false,
      ethylene_sensitive: false,
      optimal_temp_c: 15,
      max_dist_uncooled_km: 100,
    },
    Ambul: {
      variant_name: "Ambul",
      force_refrigeration: true,
      max_safe_temp_c: 14,
      min_safe_temp_c: 13,
      ethylene_producer: true,
      ethylene_sensitive: false,
      optimal_temp_c: 14,
      max_dist_uncooled_km: 50,
    },
    TJC: {
      variant_name: "TJC",
      force_refrigeration: true,
      max_safe_temp_c: 18,
      min_safe_temp_c: 12,
      ethylene_producer: false,
      ethylene_sensitive: true,
      optimal_temp_c: 15,
      max_dist_uncooled_km: 30,
    },
  };

  // Custom logging function to show exactly what the engine is thinking
  const testLogger = (message) => {
    console.log(message);
  };

  try {
    console.log(
      `[INIT] Loaded ${testOrders.length} Orders, ${testFleet.length} Vehicles, and 3 Biochemical Profiles.`,
    );
    console.log(`[INIT] Handing over to Allocation Engine... \n`);

    const result = await runAllocationEngine(
      testOrders,
      testFleet,
      testSpecs,
      targetDate,
      testLogger,
    );

    console.log(
      "\n==================================================================",
    );
    console.log("BATCH COMPLETE. FINAL MANIFEST RESULTS:");
    console.log(
      "==================================================================",
    );

    // Print the final routes beautifully
    result.scheduledJobs.forEach((job, index) => {
      console.log(`\n MANIFEST ${index + 1}: ${job.route_name}`);
      console.log(`   Vehicle ID: ${job.vehicle_id}`);
      console.log(`   Truck Type: ${job.vehicle_type_assigned}`);
      console.log(
        `   Thermostat: ${job.cooling_unit_on ? `ON (${job.set_temperature_c}°C)` : "OFF"}`,
      );
      console.log(`   Total Load: ${job.total_weight_kg}kg`);
      console.log(`   Route Steps (${job.route_manifest.length} stops):`);

      job.route_manifest.forEach((stop) => {
        console.log(
          `     ${stop.sequence}. [${stop.type}] ${stop.allocated_quantity}kg of ${stop.fruit_variant} at ${stop.location_name} (Est. ${stop.estimated_duration_mins} mins away)`,
        );
      });
    });

    if (result.overflowJobs.length > 0) {
      console.log("\n  OVERFLOW DETECTED (Sent to 3PL External Contractors):");
      result.overflowJobs.forEach((job) => {
        console.log(
          `   -> ${job.total_weight_kg}kg pending pickup. Admin assigned.`,
        );
      });
    }
  } catch (error) {
    console.error("\n TEST FAILED:", error);
  }
}

// Execute the test
runLivePanelTest();
