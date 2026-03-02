const { optimizeManifest } = require('./utils/routeOptimizer');

async function testOptimization() {
  console.log("=== STARTING ROUTE OPTIMIZATION TEST ===");

  // Vehicle starting position (e.g., Colombo Logistics Hub)
  const startLat = 6.9271;
  const startLng = 79.8612;

  // Mock Orders with real GPS coordinates in Sri Lanka
  const mockOrders = [
    {
      id: "ORD-001",
      // Pickup in Negombo (North of Colombo)
      pickup_lat: 7.2008,
      pickup_lng: 79.8737,
      // Drop in Kandy (Central)
      drop_lat: 7.2906,
      drop_lng: 80.6337,
    },
    {
      id: "ORD-002",
      // Pickup in Gampaha (Between Colombo and Negombo)
      pickup_lat: 7.0873,
      pickup_lng: 79.9996,
      // Drop in Dambulla (North Central)
      drop_lat: 7.8731,
      drop_lng: 80.7718,
    },
    {
      id: "ORD-003",
      // Pickup in Kurunegala (North West)
      pickup_lat: 7.4818,
      pickup_lng: 80.3609,
      // Drop in Nuwara Eliya (Deep Central South of Kandy)
      drop_lat: 6.9497,
      drop_lng: 80.7891,
    }
  ];

  console.log(`Testing with ${mockOrders.length} orders (Total 6 stops)`);
  console.log(`Starting Vehicle at Colombo: lat ${startLat}, lng ${startLng}`);
  console.log("-----------------------------------------------------");

  try {
    const optimizedRoute = await optimizeManifest(mockOrders, startLat, startLng);
    
    console.log("\n=== FINAL OPTIMIZED ROUTE MANIFEST ===");
    console.table(optimizedRoute.map(stop => ({
      Sequence: stop.sequence,
      Action: stop.type,
      OrderID: stop.order_id,
      "Distance From Last (km)": stop.distance_from_last_km,
      "Est. Drive Time (mins)": stop.estimated_duration_mins
    })));

    const totalDistance = optimizedRoute.reduce((sum, stop) => sum + stop.distance_from_last_km, 0);
    const totalTime = optimizedRoute.reduce((sum, stop) => sum + stop.estimated_duration_mins, 0);

    console.log(`\nTotal Route Distance: ${totalDistance.toFixed(1)} km`);
    console.log(`Total Estimated Driving Time: ${totalTime} mins (${(totalTime/60).toFixed(1)} hours)`);
    console.log("=====================================================");

  } catch (error) {
    console.error("Test failed:", error);
  }
}

testOptimization();
