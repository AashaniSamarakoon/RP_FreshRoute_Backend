// // // utils/routeOptimizer.js
// // const { getDrivingDistanceKm } = require("./logisticsUtils");

// // async function optimizeManifest(orders, startLat, startLng) {
// //   // 1. Define the starting point (The Vehicle's current location)
// //   let currentPos = { lat: startLat, lng: startLng };

// //   let unvisitedStops = [];

// //   // 2. Break orders into GPS Stops
// //   orders.forEach((o) => {
// //     unvisitedStops.push({
// //       id: `PICK-${o.id}`,
// //       type: "PICKUP",
// //       lat: o.pickup_lat,
// //       lng: o.pickup_lng,
// //       orderId: o.id,
// //     });
// //     unvisitedStops.push({
// //       id: `DROP-${o.id}`,
// //       type: "DROP",
// //       lat: o.drop_lat,
// //       lng: o.drop_lng,
// //       orderId: o.id,
// //     });
// //   });

// //   let route = [];
// //   let onboardOrders = new Set();

// //   // 3. Greedy Nearest Neighbor Loop
// //   while (unvisitedStops.length > 0) {
// //     // Filter: Can only DROP if we have picked it up
// //     const validCandidates = unvisitedStops.filter((stop) => {
// //       if (stop.type === "PICKUP") return true;
// //       if (stop.type === "DROP") return onboardOrders.has(stop.orderId);
// //       return false;
// //     });

// //     if (validCandidates.length === 0) break;

// //     // Find closest GPS point
// //     let closestStop = null;
// //     let minDist = Infinity;
// //     let minDuration = Infinity;

// //     // Use a basic loop instead of forEach since we need async/await
// //     for (const stop of validCandidates) {
// //       const routingData = await getDrivingDistanceKm(
// //         currentPos.lat,
// //         currentPos.lng,
// //         stop.lat,
// //         stop.lng,
// //       );

// //       const d = routingData.durationMins; // Optimize for TIME, not just distance

// //       if (d < minDuration) {
// //         // Changed to optimize for duration
// //         minDist = routingData.distanceKm;
// //         minDuration = d;
// //         closestStop = stop;
// //       }
// //     }

// //     // Add to Route
// //     route.push({
// //       sequence: route.length + 1,
// //       type: closestStop.type,
// //       lat: closestStop.lat,
// //       lng: closestStop.lng,
// //       distance_from_last_km: minDist,
// //       estimated_duration_mins: minDuration,
// //       order_id: closestStop.orderId,
// //     });

// //     // Move Truck
// //     currentPos = { lat: closestStop.lat, lng: closestStop.lng };
// //     if (closestStop.type === "PICKUP") onboardOrders.add(closestStop.orderId);

// //     // Remove from pending
// //     unvisitedStops = unvisitedStops.filter((s) => s.id !== closestStop.id);
// //   }

// //   // Calculate Initial Greedy Route Duration
// //   let initialTotalDuration = route.reduce(
// //     (sum, stop) => sum + stop.estimated_duration_mins,
// //     0,
// //   );
// //   console.log(
// //     `[OPTIMIZER] Initial Greedy Route Duration: ${initialTotalDuration} mins`,
// //   );

// //   // 4. 2-Opt Heuristic Optimization (Minimize Total Route Time)
// //   console.log(
// //     `[OPTIMIZER] Starting 2-Opt refinement for ${route.length} stops...`,
// //   );
// //   let improvement = true;
// //   let iterations = 0;
// //   const MAX_ITERATIONS = 50; // Prevent infinite loops

// //   while (improvement && iterations < MAX_ITERATIONS) {
// //     improvement = false;
// //     iterations++;

// //     // We can't swap the first node (start location), so loop from index 1 to N-2
// //     for (let i = 1; i < route.length - 1; i++) {
// //       for (let k = i + 1; k < route.length; k++) {
// //         // 2-opt Swap: reverse the segment between i and k
// //         let newRoute = [
// //           ...route.slice(0, i),
// //           ...route.slice(i, k + 1).reverse(),
// //           ...route.slice(k + 1),
// //         ];

// //         // VALIDITY CHECK: A DROP cannot occur before its corresponding PICKUP
// //         let isValid = true;
// //         let onboard = new Set();

// //         for (let j = 0; j < newRoute.length; j++) {
// //           let stop = newRoute[j];
// //           if (stop.type === "PICKUP") {
// //             onboard.add(stop.order_id);
// //           } else if (stop.type === "DROP") {
// //             if (!onboard.has(stop.order_id)) {
// //               isValid = false; // Invalid Route: Dropoff before Pickup!
// //               break;
// //             }
// //           }
// //         }

// //         if (!isValid) continue;

// //         // Calculate Cost (Duration) of new swapped route segment
// //         // We only need to check the 'edges' that broke (i-1 to i, and k to k+1) for speed,
// //         // but since our graph distances via OSRM are asynchronous, we will evaluate the full new route.
// //         let newTotalDuration = 0;
// //         let tempPos = { lat: startLat, lng: startLng };

// //         for (let j = 0; j < newRoute.length; j++) {
// //           const routingData = await getDrivingDistanceKm(
// //             tempPos.lat,
// //             tempPos.lng,
// //             newRoute[j].lat,
// //             newRoute[j].lng,
// //           );
// //           newTotalDuration += routingData.durationMins;
// //           // Also update the segment metrics for the final output
// //           newRoute[j].distance_from_last_km = routingData.distanceKm;
// //           newRoute[j].estimated_duration_mins = routingData.durationMins;
// //           tempPos = { lat: newRoute[j].lat, lng: newRoute[j].lng };
// //         }

// //         // If the swapped route is faster, keep it!
// //         if (newTotalDuration < initialTotalDuration) {
// //           console.log(
// //             `[OPTIMIZER] Iteration ${iterations}: Found better route! Saved ${initialTotalDuration - newTotalDuration} mins.`,
// //           );
// //           route = newRoute;
// //           initialTotalDuration = newTotalDuration;
// //           improvement = true;
// //         }
// //       }
// //     }
// //   }

// //   console.log(
// //     `[OPTIMIZER] Final Optimized Route Duration: ${initialTotalDuration} mins (after ${iterations} 2-opt passes)`,
// //   );

// //   // Re-sequence the IDs
// //   route.forEach((stop, index) => {
// //     stop.sequence = index + 1;
// //   });

// //   return route;
// // }

// // module.exports = { optimizeManifest };

// const { getDrivingDistanceKm } = require("./logisticsUtils");

// async function optimizeManifest(orders, startLat, startLng) {
//   let startNode = { id: "START", type: "START", lat: startLat, lng: startLng };
//   let unvisitedStops = [];

//   // 1. Break orders into GPS Stops & INJECT UI DETAILS
//   orders.forEach((o) => {
//     unvisitedStops.push({
//       id: `PICK-${o.id}`,
//       type: "PICKUP",
//       lat: o._algo.pLat,
//       lng: o._algo.pLng,
//       orderId: o.id,
//       allocated_quantity: o.allocated_quantity,
//       fruit_variant: o.fruit_variant,
//       location_name: o.pickup_location || "Unknown Pickup",
//     });
//     unvisitedStops.push({
//       id: `DROP-${o.id}`,
//       type: "DROP",
//       lat: o._algo.dLat,
//       lng: o._algo.dLng,
//       orderId: o.id,
//       allocated_quantity: o.allocated_quantity,
//       fruit_variant: o.fruit_variant,
//       location_name: o.drop_location || "Unknown Dropoff",
//     });
//   });

//   const allNodes = [startNode, ...unvisitedStops];

//   // 2. PRE-COMPUTE DISTANCE MATRIX
//   const distanceMatrix = {};
//   console.log(
//     `[OPTIMIZER] Pre-computing Distance Matrix for ${allNodes.length} points...`,
//   );

//   for (let i = 0; i < allNodes.length; i++) {
//     distanceMatrix[allNodes[i].id] = {};
//     for (let j = 0; j < allNodes.length; j++) {
//       if (i === j) {
//         distanceMatrix[allNodes[i].id][allNodes[j].id] = {
//           distanceKm: 0,
//           durationMins: 0,
//         };
//       } else {
//         const routingData = await getDrivingDistanceKm(
//           allNodes[i].lat,
//           allNodes[i].lng,
//           allNodes[j].lat,
//           allNodes[j].lng,
//         );
//         distanceMatrix[allNodes[i].id][allNodes[j].id] = routingData;
//       }
//     }
//   }

//   const getCachedDuration = (fromId, toId) =>
//     distanceMatrix[fromId][toId].durationMins;
//   const getCachedDistance = (fromId, toId) =>
//     distanceMatrix[fromId][toId].distanceKm;

//   // 3. GREEDY NEAREST NEIGHBOR
//   let route = [];
//   let onboardOrders = new Set();
//   let currentPosId = startNode.id;

//   while (unvisitedStops.length > 0) {
//     const validCandidates = unvisitedStops.filter((stop) => {
//       if (stop.type === "PICKUP") return true;
//       if (stop.type === "DROP") return onboardOrders.has(stop.orderId);
//       return false;
//     });

//     if (validCandidates.length === 0) break;

//     let closestStop = null;
//     let minDist = Infinity;
//     let minDuration = Infinity;

//     for (const stop of validCandidates) {
//       const d = getCachedDuration(currentPosId, stop.id);
//       const dist = getCachedDistance(currentPosId, stop.id);

//       if (d < minDuration) {
//         minDist = dist;
//         minDuration = d;
//         closestStop = stop;
//       }
//     }

//     // Push the stop WITH the UI fields attached
//     route.push({
//       id: closestStop.id,
//       sequence: route.length + 1,
//       type: closestStop.type,
//       lat: closestStop.lat,
//       lng: closestStop.lng,
//       distance_from_last_km: minDist,
//       estimated_duration_mins: minDuration,
//       order_id: closestStop.orderId,
//       allocated_quantity: closestStop.allocated_quantity,
//       fruit_variant: closestStop.fruit_variant,
//       location_name: closestStop.location_name,
//     });

//     currentPosId = closestStop.id;
//     if (closestStop.type === "PICKUP") onboardOrders.add(closestStop.orderId);
//     unvisitedStops = unvisitedStops.filter((s) => s.id !== closestStop.id);
//   }

//   let initialTotalDuration = route.reduce(
//     (sum, stop) => sum + stop.estimated_duration_mins,
//     0,
//   );

//   // 4. 2-OPT HEURISTIC REFINEMENT
//   let improvement = true;
//   let iterations = 0;
//   const MAX_ITERATIONS = 50;

//   while (improvement && iterations < MAX_ITERATIONS) {
//     improvement = false;
//     iterations++;

//     for (let i = 1; i < route.length - 1; i++) {
//       for (let k = i + 1; k < route.length; k++) {
//         // BUG FIX: .map(stop => ({ ...stop })) creates fresh memory clones so we don't corrupt the original route
//         let newRoute = [
//           ...route.slice(0, i),
//           ...route.slice(i, k + 1).reverse(),
//           ...route.slice(k + 1),
//         ].map((stop) => ({ ...stop }));

//         let isValid = true;
//         let onboard = new Set();

//         for (let j = 0; j < newRoute.length; j++) {
//           let stop = newRoute[j];
//           if (stop.type === "PICKUP") onboard.add(stop.order_id);
//           else if (stop.type === "DROP" && !onboard.has(stop.order_id)) {
//             isValid = false;
//             break;
//           }
//         }

//         if (!isValid) continue;

//         let newTotalDuration = 0;
//         let tempPosId = startNode.id;

//         for (let j = 0; j < newRoute.length; j++) {
//           const d = getCachedDuration(tempPosId, newRoute[j].id);
//           const dist = getCachedDistance(tempPosId, newRoute[j].id);
//           newTotalDuration += d;

//           // Because of our clone above, these mutations are now completely safe!
//           newRoute[j].distance_from_last_km = dist;
//           newRoute[j].estimated_duration_mins = d;
//           tempPosId = newRoute[j].id;
//         }

//         if (newTotalDuration < initialTotalDuration) {
//           route = newRoute;
//           initialTotalDuration = newTotalDuration;
//           improvement = true;
//         }
//       }
//     }
//   }

//   // 5. CLEANUP FOR FINAL JSON OUTPUT
//   route.forEach((stop, index) => {
//     stop.sequence = index + 1;
//     delete stop.id;
//   });

//   return route;
// }

// module.exports = { optimizeManifest };

const { getDrivingDistanceKm } = require("./logisticsUtils");

async function optimizeManifest(orders, startLat, startLng) {
  let startNode = { id: "START", type: "START", lat: startLat, lng: startLng };
  let unvisitedStops = [];

  // 1. Break orders into GPS Stops & INJECT UI DETAILS
  orders.forEach((o) => {
    unvisitedStops.push({
      id: `PICK-${o.id}`,
      type: "PICKUP",
      lat: o._algo.pLat,
      lng: o._algo.pLng,
      orderId: o.id,
      allocated_quantity: o.allocated_quantity,
      fruit_variant: o.fruit_variant,
      location_name: o.pickup_location || "Unknown Pickup",
    });
    unvisitedStops.push({
      id: `DROP-${o.id}`,
      type: "DROP",
      lat: o._algo.dLat,
      lng: o._algo.dLng,
      orderId: o.id,
      allocated_quantity: o.allocated_quantity,
      fruit_variant: o.fruit_variant,
      location_name: o.drop_location || "Unknown Dropoff",
    });
  });

  const allNodes = [startNode, ...unvisitedStops];

  // 2. PRE-COMPUTE DISTANCE MATRIX (Prevents API DDoS)
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
      if (stop.type === "DROP") return onboardOrders.has(stop.orderId);
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

    // Push the stop WITH the UI fields attached
    route.push({
      id: closestStop.id,
      sequence: route.length + 1,
      type: closestStop.type,
      lat: closestStop.lat,
      lng: closestStop.lng,
      distance_from_last_km: minDist,
      estimated_duration_mins: minDuration,
      order_id: closestStop.orderId,
      allocated_quantity: closestStop.allocated_quantity,
      fruit_variant: closestStop.fruit_variant,
      location_name: closestStop.location_name,
    });

    currentPosId = closestStop.id;
    if (closestStop.type === "PICKUP") onboardOrders.add(closestStop.orderId);
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
        // MEMORY BUG FIX: .map(stop => ({ ...stop })) creates fresh memory clones
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

          // Safe to mutate because of clone
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

  // 5. CLEANUP FOR FINAL JSON OUTPUT
  route.forEach((stop, index) => {
    stop.sequence = index + 1;
    delete stop.id; // Remove temporary cache IDs
  });

  return route;
}

module.exports = { optimizeManifest };
