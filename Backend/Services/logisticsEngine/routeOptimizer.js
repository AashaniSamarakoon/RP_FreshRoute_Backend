// services/logisticsEngine/routeOptimizer.js
const { getDrivingDistanceKm } = require("./utils");

async function optimizeManifest(orders, startLat, startLng) {
  let startNode = { id: "START", type: "START", lat: startLat, lng: startLng };
  let unvisitedStops = [];

  // 1. Break orders into GPS Stops
  orders.forEach((o) => {
    unvisitedStops.push({
      id: `PICK-${o.id}`,
      type: "PICKUP",
      lat: o._algo.pLat,
      lng: o._algo.pLng,
      order_id: o.id,
      allocated_quantity: o.allocated_quantity,
      fruit_variant: o.fruit_variant,
      location_name: o.pickup_location || "Unknown Pickup",
    });
    unvisitedStops.push({
      id: `DROP-${o.id}`,
      type: "DROP",
      lat: o._algo.dLat,
      lng: o._algo.dLng,
      order_id: o.id,
      allocated_quantity: o.allocated_quantity,
      fruit_variant: o.fruit_variant,
      location_name: o.drop_location || "Unknown Dropoff",
    });
  });

  const allNodes = [startNode, ...unvisitedStops];

  // 2. PRE-COMPUTE DISTANCE MATRIX
  const distanceMatrix = {};
  for (let i = 0; i < allNodes.length; i++) {
    distanceMatrix[allNodes[i].id] = {};
    for (let j = 0; j < allNodes.length; j++) {
      if (i === j) {
        distanceMatrix[allNodes[i].id][allNodes[j].id] = {
          distanceKm: 0,
          durationMins: 0,
        };
      } else {
        const routingData = await getDrivingDistanceKm(
          allNodes[i].lat,
          allNodes[i].lng,
          allNodes[j].lat,
          allNodes[j].lng,
        );
        distanceMatrix[allNodes[i].id][allNodes[j].id] = routingData;
      }
    }
  }

  const getCachedDuration = (fromId, toId) =>
    distanceMatrix[fromId][toId].durationMins;
  const getCachedDistance = (fromId, toId) =>
    distanceMatrix[fromId][toId].distanceKm;

  // 3. GREEDY NEAREST NEIGHBOR
  let route = [];
  let onboardOrders = new Set();
  let currentPosId = startNode.id;

  while (unvisitedStops.length > 0) {
    const validCandidates = unvisitedStops.filter((stop) => {
      if (stop.type === "PICKUP") return true;
      if (stop.type === "DROP") return onboardOrders.has(stop.order_id);
      return false;
    });

    if (validCandidates.length === 0) break;

    let closestStop = null;
    let minDist = Infinity;
    let minDuration = Infinity;

    for (const stop of validCandidates) {
      const d = getCachedDuration(currentPosId, stop.id);
      const dist = getCachedDistance(currentPosId, stop.id);

      if (d < minDuration) {
        minDist = dist;
        minDuration = d;
        closestStop = stop;
      }
    }

    route.push({
      id: closestStop.id,
      sequence: route.length + 1,
      type: closestStop.type,
      lat: closestStop.lat,
      lng: closestStop.lng,
      distance_from_last_km: minDist,
      estimated_duration_mins: minDuration,
      order_id: closestStop.order_id,
      allocated_quantity: closestStop.allocated_quantity,
      fruit_variant: closestStop.fruit_variant,
      location_name: closestStop.location_name,
    });

    currentPosId = closestStop.id;
    if (closestStop.type === "PICKUP") onboardOrders.add(closestStop.order_id);
    unvisitedStops = unvisitedStops.filter((s) => s.id !== closestStop.id);
  }

  let initialTotalDuration = route.reduce(
    (sum, stop) => sum + stop.estimated_duration_mins,
    0,
  );

  // 4. 2-OPT HEURISTIC REFINEMENT
  let improvement = true;
  let iterations = 0;
  const MAX_ITERATIONS = 50;

  while (improvement && iterations < MAX_ITERATIONS) {
    improvement = false;
    iterations++;

    for (let i = 1; i < route.length - 1; i++) {
      for (let k = i + 1; k < route.length; k++) {
        let newRoute = [
          ...route.slice(0, i),
          ...route.slice(i, k + 1).reverse(),
          ...route.slice(k + 1),
        ].map((stop) => ({ ...stop }));

        let isValid = true;
        let onboard = new Set();

        for (let j = 0; j < newRoute.length; j++) {
          let stop = newRoute[j];
          if (stop.type === "PICKUP") onboard.add(stop.order_id);
          else if (stop.type === "DROP" && !onboard.has(stop.order_id)) {
            isValid = false;
            break;
          }
        }

        if (!isValid) continue;

        let newTotalDuration = 0;
        let tempPosId = startNode.id;

        for (let j = 0; j < newRoute.length; j++) {
          const d = getCachedDuration(tempPosId, newRoute[j].id);
          const dist = getCachedDistance(tempPosId, newRoute[j].id);
          newTotalDuration += d;

          newRoute[j].distance_from_last_km = dist;
          newRoute[j].estimated_duration_mins = d;
          tempPosId = newRoute[j].id;
        }

        if (newTotalDuration < initialTotalDuration) {
          route = newRoute;
          initialTotalDuration = newTotalDuration;
          improvement = true;
        }
      }
    }
  }

  // 5. FINAL CLEANUP
  route.forEach((stop, index) => {
    stop.sequence = index + 1;
    delete stop.id;
  });

  return route;
}

module.exports = { optimizeManifest };
