// utils/routeOptimizer.js
const { calculateDistanceKm } = require("./logisticsUtils");

function optimizeManifest(orders, startLat, startLng) {
  // 1. Define the starting point (The Vehicle's current location)
  let currentPos = { lat: startLat, lng: startLng };

  let unvisitedStops = [];

  // 2. Break orders into GPS Stops
  orders.forEach((o) => {
    unvisitedStops.push({
      id: `PICK-${o.id}`,
      type: "PICKUP",
      lat: o.pickup_lat,
      lng: o.pickup_lng,
      orderId: o.id,
    });
    unvisitedStops.push({
      id: `DROP-${o.id}`,
      type: "DROP",
      lat: o.drop_lat,
      lng: o.drop_lng,
      orderId: o.id,
    });
  });

  let route = [];
  let onboardOrders = new Set();

  // 3. Greedy Nearest Neighbor Loop
  while (unvisitedStops.length > 0) {
    // Filter: Can only DROP if we have picked it up
    const validCandidates = unvisitedStops.filter((stop) => {
      if (stop.type === "PICKUP") return true;
      if (stop.type === "DROP") return onboardOrders.has(stop.orderId);
      return false;
    });

    if (validCandidates.length === 0) break;

    // Find closest GPS point
    let closestStop = null;
    let minDist = Infinity;

    validCandidates.forEach((stop) => {
      const d = calculateDistanceKm(
        currentPos.lat,
        currentPos.lng,
        stop.lat,
        stop.lng
      );
      if (d < minDist) {
        minDist = d;
        closestStop = stop;
      }
    });

    // Add to Route
    route.push({
      sequence: route.length + 1,
      type: closestStop.type,
      lat: closestStop.lat,
      lng: closestStop.lng,
      distance_from_last_km: minDist,
      order_id: closestStop.orderId,
    });

    // Move Truck
    currentPos = { lat: closestStop.lat, lng: closestStop.lng };
    if (closestStop.type === "PICKUP") onboardOrders.add(closestStop.orderId);

    // Remove from pending
    unvisitedStops = unvisitedStops.filter((s) => s.id !== closestStop.id);
  }

  return route;
}

module.exports = { optimizeManifest };
