const fs = require('fs');

// --- 1. MOCK DATA SETTINGS ---
const NUM_ORDERS = 10000;
const NUM_VEHICLES = {
  REFRIGERATED: 500,
  COVERED: 800,
  UNCOVERED: 1200
};

// Costs per trip
const COSTS = {
  REFRIGERATED: 5000,
  COVERED: 2500,
  UNCOVERED: 1500
};

const PRODUCT_SPECS = {
  MANGO_TJC: { maxSafeAmbientTemp: 30, maxSafeDistance: 150 },
  BANANA_AMBUL: { maxSafeAmbientTemp: 28, maxSafeDistance: 100 }
};

// --- 2. GENERATE DATASET ---
function generateDataset() {
  console.log(`Generating ${NUM_ORDERS} mock orders and fleet...`);
  
  const fleet = [];
  let vId = 1;
  for (const [type, count] of Object.entries(NUM_VEHICLES)) {
    for (let i = 0; i < count; i++) {
        // Capacities: 1000, 2000, 3000
      fleet.push({
        id: `V${vId++}`,
        type: type,
        capacity: Math.floor(Math.random() * 3 + 1) * 1000,
        status: "AVAILABLE",
        cost: COSTS[type]
      });
    }
  }

  const orders = [];
  for (let i = 1; i <= NUM_ORDERS; i++) {
    const isMango = Math.random() > 0.5;
    orders.push({
      id: `ORD-${i}`,
      variant: isMango ? "MANGO_TJC" : "BANANA_AMBUL",
      qty: Math.floor(Math.random() * 2000) + 100, // 100 to 2100 kg
      distance: Math.floor(Math.random() * 250) + 10, // 10 to 260 km
      weather: {
        temp: Math.floor(Math.random() * 15) + 22, // 22C to 36C
        raining: Math.random() > 0.8 // 20% chance of rain
      }
    });
  }

  return { fleet, orders };
}

// Helper to deep clone fleet so each algorithm starts fresh
function cloneFleet(fleet) {
  return fleet.map(v => ({ ...v }));
}

// --- 3. EVALUATION FUNCTION (The Judge) ---
// Returns metrics based on assignments
function evaluateAssignments(orders, jobs) {
  let spoilageCount = 0;
  let totalCost = 0;
  let fulfilledQty = 0;
  let totalQty = orders.reduce((sum, o) => sum + o.qty, 0);

  const jobsByOrder = {};
  for(let j of jobs) {
      if(!jobsByOrder[j.orderId]) jobsByOrder[j.orderId] = [];
      jobsByOrder[j.orderId].push(j);
      totalCost += j.truckInfo.cost;
      fulfilledQty += j.load;
  }

  for (const order of orders) {
    const orderJobs = jobsByOrder[order.id];
    if (!orderJobs) continue; // Unfulfilled

    const specs = PRODUCT_SPECS[order.variant];
    const isHot = order.weather.temp > specs.maxSafeAmbientTemp;
    const isLong = order.distance > specs.maxSafeDistance;
    const requiresRef = isHot || isLong;
    const requiresCover = order.weather.raining;

    // Check if ANY part of the order was transported unsafely
    let violated = false;
    for (const job of orderJobs) {
      const type = job.truckInfo.type;
      if (requiresRef && type !== "REFRIGERATED") violated = true;
      if (requiresCover && type === "UNCOVERED") violated = true;
    }

    if (violated) {
      // We consider the whole order spoiled for the metric if any chunk was unsafe
      spoilageCount++;
    }
  }

  return {
    spoilageRate: (spoilageCount / orders.length) * 100,
    fulfillmentRate: (fulfilledQty / totalQty) * 100,
    totalCost: totalCost,
    fleetUsed: jobs.length
  };
}

// --- 4. ALGORITHMS ---

// BASELINE 1: Random Assignment
function algoRandom(orders, initialFleet) {
  const fleet = cloneFleet(initialFleet);
  const jobs = [];
  
  for (const order of orders) {
    let remaining = order.qty;
    
    while (remaining > 0) {
      const available = fleet.filter(v => v.status === "AVAILABLE");
      if (available.length === 0) break; // Out of trucks
      
      const truck = available[Math.floor(Math.random() * available.length)];
      const load = Math.min(truck.capacity, remaining);
      
      jobs.push({ orderId: order.id, load: load, truckInfo: truck });
      truck.status = "USED";
      remaining -= load;
    }
  }
  return jobs;
}

// BASELINE 2: Naive Greedy (Cheapest first)
function algoGreedy(orders, initialFleet) {
  const fleet = cloneFleet(initialFleet);
  // Sort cheapest first
  fleet.sort((a, b) => a.cost - b.cost);
  const jobs = [];

  for (const order of orders) {
    let remaining = order.qty;
    
    while (remaining > 0) {
      const available = fleet.filter(v => v.status === "AVAILABLE");
      if (available.length === 0) break; 
      
      const truck = available[0]; // Take cheapest available
      const load = Math.min(truck.capacity, remaining);
      
      jobs.push({ orderId: order.id, load: load, truckInfo: truck });
      truck.status = "USED";
      remaining -= load;
    }
  }
  return jobs;
}

// PROPOSED: FreshRoute Logic
function algoFreshRoute(orders, initialFleet) {
  const fleet = cloneFleet(initialFleet);
  const jobs = [];

  for (const order of orders) {
    const specs = PRODUCT_SPECS[order.variant];
    const isHot = order.weather.temp > specs.maxSafeAmbientTemp;
    const isLong = order.distance > specs.maxSafeDistance;
    
    let reqType = "UNCOVERED";
    if (isHot || isLong) reqType = "REFRIGERATED";
    else if (order.weather.raining) reqType = "COVERED";

    let acceptableTypes = [];
    if (reqType === "REFRIGERATED") acceptableTypes = ["REFRIGERATED"];
    else if (reqType === "COVERED") acceptableTypes = ["COVERED", "REFRIGERATED"];
    else acceptableTypes = ["UNCOVERED", "COVERED", "REFRIGERATED"];

    let remaining = order.qty;
    
    while (remaining > 0) {
      let candidates = fleet.filter(v => v.status === "AVAILABLE" && acceptableTypes.includes(v.type));
      if (candidates.length === 0) break; 

      // Sort: best match first, then largest capacity
      candidates.sort((a, b) => {
        const typeScore = t => t === "REFRIGERATED" ? 2 : t === "COVERED" ? 1 : 0;
        const reqScore = reqType === "REFRIGERATED" ? 2 : reqType === "COVERED" ? 1 : 0;
        const diffA = Math.abs(typeScore(a.type) - reqScore);
        const diffB = Math.abs(typeScore(b.type) - reqScore);
        if (diffA !== diffB) return diffA - diffB;
        return b.capacity - a.capacity;
      });

      const truck = candidates[0];
      const load = Math.min(truck.capacity, remaining);
      
      jobs.push({ orderId: order.id, load: load, truckInfo: truck });
      truck.status = "USED";
      remaining -= load;
    }
  }
  return jobs;
}

// --- 5. EXECUTE BENCHMARK ---
async function run() {
  const { orders, fleet } = generateDataset();

  console.log("\nStarting Benchmark Loop...");
  const results = [];

  const runAlgo = (name, algoFn) => {
    const start = performance.now();
    const jobs = algoFn(orders, fleet);
    const end = performance.now();
    
    const metrics = evaluateAssignments(orders, jobs);
    results.push({
      Algorithm: name,
      "Time(ms)": (end - start).toFixed(2),
      "Spoilage %": metrics.spoilageRate.toFixed(2) + "%",
      "Cost ($)": metrics.totalCost,
      "Fulfillment %": metrics.fulfillmentRate.toFixed(2) + "%",
      "Trucks Used": metrics.fleetUsed
    });
  };

  runAlgo("Random", algoRandom);
  runAlgo("Naive Greedy", algoGreedy);
  runAlgo("FreshRoute", algoFreshRoute);

  console.table(results);
}

run();
