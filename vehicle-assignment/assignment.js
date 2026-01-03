// ==========================================
// 1. MOCK DATA & CONFIGURATION
// ==========================================

// Product Specifications (Constraints)
const PRODUCT_SPECS = {
  MANGO_TJC: {
    optimalTemp: 13, // Celsius
    maxSafeAmbientTemp: 30,
    maxSafeDistanceWithoutCooling: 150, // km
    requiresRefrigerationDefault: false, // TJC is hardy, usually doesn't need ref by default
  },
  BANANA_AMBUL: {
    optimalTemp: 14,
    maxSafeAmbientTemp: 28,
    maxSafeDistanceWithoutCooling: 100, // km
    requiresRefrigerationDefault: false,
  },
};

// Mock Database: Vehicles
// Types: 'REFRIGERATED', 'COVERED', 'UNCOVERED'
let VEHICLE_FLEET = [
  { id: "V001", type: "REFRIGERATED", capacity: 1000, status: "AVAILABLE" },
  { id: "V002", type: "REFRIGERATED", capacity: 2000, status: "AVAILABLE" },
  { id: "V003", type: "COVERED", capacity: 1500, status: "AVAILABLE" }, // Non-refrigerated but covered
  { id: "V004", type: "COVERED", capacity: 1000, status: "AVAILABLE" },
  { id: "V005", type: "UNCOVERED", capacity: 800, status: "AVAILABLE" }, // Open truck
  { id: "V006", type: "UNCOVERED", capacity: 800, status: "AVAILABLE" },
];

// Mock Database: Orders
const MOCK_ORDERS = {
  "ORD-101": {
    id: "ORD-101",
    fruitType: "Mango",
    variant: "MANGO_TJC",
    qty: 2500, // Large order, will trigger split
    orderDate: "2023-10-25",
    pickupLocation: "Farm_A",
    dropLocation: "Market_B",
  },
  "ORD-102": {
    id: "ORD-102",
    fruitType: "Banana",
    variant: "BANANA_AMBUL",
    qty: 500,
    orderDate: "2023-10-26",
    pickupLocation: "Farm_C",
    dropLocation: "Supermarket_D",
  },
};

// ==========================================
// 2. MOCK SERVICES (Weather & Distance)
// ==========================================

const getWeather = async (date, location) => {
  // Simulating API latency
  return new Promise((resolve) => {
    // Mock logic: randomly determine weather for demonstration
    // In real world, use date/lat/long
    const isHotDay = Math.random() > 0.5;
    const isRaining = Math.random() > 0.5;

    const weatherData = {
      temp: isHotDay ? 32 : 25, // 32 is above threshold for TJC
      raining: isRaining,
    };
    console.log(
      `[API] Weather fetch for ${date}: Temp ${weatherData.temp}°C, Raining: ${weatherData.raining}`
    );
    resolve(weatherData);
  });
};

const getDistance = (pickup, drop) => {
  // Mock distance logic
  const mockDist = 120; // km
  console.log(`[API] Distance calculated: ${mockDist} km`);
  return mockDist;
};

// ==========================================
// 3. CONTROLLER LOGIC
// ==========================================

const assignVehicleController = async (req, res) => {
  try {
    const { orderId } = req.body;
    console.log(`\n--- STARTING ASSIGNMENT FOR ORDER: ${orderId} ---`);

    // 1. Fetch Order Data
    const order = MOCK_ORDERS[orderId];
    if (!order) return res.status(404).json({ error: "Order not found" });

    console.log(`[Data] Order Found: ${order.variant}, Qty: ${order.qty}kg`);

    // 2. Get External Factors
    const weather = await getWeather(order.orderDate, order.pickupLocation);
    const distance = getDistance(order.pickupLocation, order.dropLocation);
    const specs = PRODUCT_SPECS[order.variant];

    // 3. Algorithm: Determine Required Vehicle Type
    let requiredType = determineVehicleTypeRequirements(
      specs,
      weather,
      distance
    );

    // 4. Algorithm: Assign Vehicles (Handling Capacity)
    const assignmentResult = fulfillOrderCapacity(order, requiredType);

    // 5. Response
    if (assignmentResult.success) {
      console.log(
        `--- ASSIGNMENT COMPLETE: ${assignmentResult.jobs.length} Job(s) created ---`
      );
      return res.status(200).json({
        message: "Vehicles Assigned Successfully",
        jobs: assignmentResult.jobs,
        logisticsSummary: {
          weatherCondition: weather,
          distance: distance,
          vehicleTypeSelected: requiredType.primarySelection,
        },
      });
    } else {
      console.log(`!!! ASSIGNMENT FAILED: ${assignmentResult.reason} !!!`);
      return res.status(400).json({ error: assignmentResult.reason });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

// ==========================================
// 4. ALGORITHM HELPERS
// ==========================================

/**
 * LOGIC CORE 1: Decides the constraints for the vehicle type
 * Returns an object describing the 'Target' vehicle profile
 */
function determineVehicleTypeRequirements(specs, weather, distance) {
  console.log("[Algo] Analyzing constraints...");

  // Check 1: Default Product Requirement
  if (specs.requiresRefrigerationDefault) {
    console.log("[Algo] Decision: REFRIGERATED (Product Strict Requirement)");
    return { type: "REFRIGERATED", reason: "Product Default" };
  }

  // Check 2: Weather (Temperature)
  if (weather.temp > specs.maxSafeAmbientTemp) {
    console.log(
      `[Algo] Decision: REFRIGERATED (High Ambient Temp: ${weather.temp}°C > ${specs.maxSafeAmbientTemp}°C)`
    );
    return { type: "REFRIGERATED", reason: "High Temperature" };
  }

  // Check 3: Distance
  if (distance > specs.maxSafeDistanceWithoutCooling) {
    console.log(
      `[Algo] Decision: REFRIGERATED (Long Distance: ${distance}km > ${specs.maxSafeDistanceWithoutCooling}km)`
    );
    return { type: "REFRIGERATED", reason: "Long Distance" };
  }

  // Check 4: Weather (Rain)
  // If we reached here, refrigeration is not strictly needed for Temp/Distance.
  if (weather.raining) {
    console.log("[Algo] Decision: COVERED (Raining)");
    // If raining, we prefer COVERED, but REFRIGERATED is also acceptable (as it is closed)
    // UNCOVERED is banned.
    return { type: "COVERED_OR_BETTER", reason: "Rain Protection" };
  }

  // Default
  console.log("[Algo] Decision: ANY (Conditions Optimal)");
  return { type: "ANY", reason: "Optimal Conditions" };
}

/**
 * LOGIC CORE 2: Finds specific vehicles to meet the quantity
 */
function fulfillOrderCapacity(order, requirement) {
  let remainingQty = order.qty;
  let assignedJobs = [];

  // Create a working copy of fleet to avoid modifying global state directly during search
  let availableFleet = VEHICLE_FLEET.filter((v) => v.status === "AVAILABLE");

  // Filter fleet based on Requirement Level
  let suitableVehicles = filterVehiclesByRequirement(
    availableFleet,
    requirement.type
  );

  // Sort logic: Use largest vehicles first to minimize number of trucks?
  // Or smallest first? Usually largest first is more efficient.
  suitableVehicles.sort((a, b) => b.capacity - a.capacity);

  console.log(
    `[Algo] Found ${suitableVehicles.length} suitable vehicles. Allocating...`
  );

  for (let vehicle of suitableVehicles) {
    if (remainingQty <= 0) break;

    // Assign this vehicle
    let load = Math.min(vehicle.capacity, remainingQty);

    assignedJobs.push({
      jobId: `JOB-${Date.now()}-${vehicle.id}`,
      vehicleId: vehicle.id,
      vehicleType: vehicle.type,
      loadCarried: load,
      pickup: order.pickupLocation,
      drop: order.dropLocation,
      reasonForVehicleType: requirement.reason,
    });

    // Update tracking
    remainingQty -= load;

    // In a real DB, you would lock this row here.
    // Mocking status update:
    vehicle.status = "ASSIGNED";
    console.log(
      `   -> Assigned ${vehicle.id} (${vehicle.type}). Load: ${load}kg. Remaining: ${remainingQty}kg`
    );
  }

  if (remainingQty > 0) {
    return {
      success: false,
      reason: `Insufficient fleet capacity. Shortage: ${remainingQty}kg`,
    };
  }

  return { success: true, jobs: assignedJobs };
}

/**
 * Helper to filter vehicle list based on the strictness of the requirement
 */
function filterVehiclesByRequirement(fleet, reqType) {
  return fleet.filter((v) => {
    if (reqType === "REFRIGERATED") {
      return v.type === "REFRIGERATED";
    } else if (reqType === "COVERED_OR_BETTER") {
      // "If raining assign a covered one... if available assign. else assign any other available"
      // Interpreted as: Must be closed. So Covered OR Refrigerated is okay. Uncovered is NOT okay.
      return v.type === "COVERED" || v.type === "REFRIGERATED";
    } else if (reqType === "ANY") {
      // Preference logic: User said "assign uncovered or covered according to availability"
      // Usually Uncovered is cheaper, but we can use anything.
      return true;
    }
    return false;
  });
}

module.exports = { assignVehicleController };
