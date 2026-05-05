"use strict";

// ══════════════════════════════════════════════════════════════════════════
//  FRESHROTE LOGISTICS ENGINE — FULL ALGORITHM DEMONSTRATION
//  Run: node Backend/tests/logistics/demo.js
//
//  Self-contained. No DB, no external APIs. All data embedded.
//  Shows every decision the algorithm makes, step by step.
//  Covers all 14 algorithm paths for viva panel demonstration.
// ══════════════════════════════════════════════════════════════════════════

const C = {
  reset:"\x1b[0m", bold:"\x1b[1m", dim:"\x1b[2m",
  red:"\x1b[31m", green:"\x1b[32m", yellow:"\x1b[33m",
  blue:"\x1b[34m", magenta:"\x1b[35m", cyan:"\x1b[36m", white:"\x1b[37m",
};
const W = 74;
const bar  = (c="═") => c.repeat(W);
const thin = (c="─") => c.repeat(W);

// ── SECTION 1: FRUIT SPECS ───────────────────────────────────────────────────

const SPECS = {
  TJC: {
    force_refrigeration:true, max_safe_temp_c:25, min_safe_temp_c:12,
    optimal_temp_c:13, max_dist_uncooled_km:40,
    ethylene_producer:false, ethylene_sensitive:true,
  },
  Ambul: {
    force_refrigeration:false, max_safe_temp_c:26, min_safe_temp_c:13,
    optimal_temp_c:14, max_dist_uncooled_km:60,
    ethylene_producer:true, ethylene_sensitive:false,
  },
  All: {
    force_refrigeration:false, max_safe_temp_c:32, min_safe_temp_c:7,
    optimal_temp_c:10, max_dist_uncooled_km:150,
    ethylene_producer:false, ethylene_sensitive:false,
  },
  Strawberry: {
    force_refrigeration:true, max_safe_temp_c:20, min_safe_temp_c:2,
    optimal_temp_c:4, max_dist_uncooled_km:25,
    ethylene_producer:false, ethylene_sensitive:true,
  },
  Rathapapol: {
    force_refrigeration:false, max_safe_temp_c:30, min_safe_temp_c:10,
    optimal_temp_c:13, max_dist_uncooled_km:80,
    ethylene_producer:true, ethylene_sensitive:false,
  },
};

// ── SECTION 2: DEMO DATASET ──────────────────────────────────────────────────

const FLEET = [
  { id:"V1", vehicle_type:"REFRIGERATED", vehicle_license_plate:"MAT-REEF-01", capacity_kg:2000, current_lat:5.9522, current_lng:80.5376 },
  { id:"V2", vehicle_type:"REFRIGERATED", vehicle_license_plate:"MAT-REEF-02", capacity_kg:2000, current_lat:5.9522, current_lng:80.5376 },
  { id:"V3", vehicle_type:"COVERED",      vehicle_license_plate:"MAT-COVR-01", capacity_kg:3000, current_lat:5.9522, current_lng:80.5376 },
  { id:"V4", vehicle_type:"UNCOVERED",    vehicle_license_plate:"MAT-OPEN-01", capacity_kg:4000, current_lat:5.9522, current_lng:80.5376 },
];

// Each order has embedded weather — no API calls needed
const ORDERS = [
  {
    id:"O-TEMP", label:"Strawberry Cold Chain",
    fruit_type:"Strawberry", fruit_variant:"Strawberry",
    quantity:400,
    pickup_location:"Kamburupitiya Estate", pickup_lat:6.0683, pickup_lng:80.56,
    drop_location:"Mirissa Storage",        drop_lat:5.9483,  drop_lng:80.4536,
    _weather:{ temp_c:31, raining:false, condition:"Hot & Clear (31°C)" },
    _demo_path:"FORCE REFRIGERATION — also shows temp-conflict setup",
  },
  {
    id:"O-SPLIT", label:"Large TJC Mango Bulk",
    fruit_type:"Mango", fruit_variant:"TJC",
    quantity:3500,
    pickup_location:"Morawaka Plantations", pickup_lat:6.2828, pickup_lng:80.4819,
    drop_location:"Matara Main Market",     drop_lat:5.9522,  drop_lng:80.5376,
    _weather:{ temp_c:31, raining:false, condition:"Hot & Clear (31°C)" },
    _demo_path:"ORDER SPLITTING + MULTI-WAVE ALLOCATION",
  },
  {
    id:"O-FORCE", label:"TJC Mango (Cool Day)",
    fruit_type:"Mango", fruit_variant:"TJC",
    quantity:700,
    pickup_location:"Deniyaya Hills Farm", pickup_lat:6.3392, pickup_lng:80.5647,
    drop_location:"Weligama Market",       drop_lat:5.9752,  drop_lng:80.4285,
    _weather:{ temp_c:15, raining:false, condition:"Cool & Clear (15°C)" },
    _demo_path:"FORCE REFRIGERATION overrides cool weather",
  },
  {
    id:"O-HEAT", label:"Ambul Banana (Heat Alert)",
    fruit_type:"Banana", fruit_variant:"Ambul",
    quantity:800,
    pickup_location:"Hakmana East Estate", pickup_lat:6.138,  pickup_lng:80.646,
    drop_location:"Weligama Bay Storage",  drop_lat:5.971,   drop_lng:80.43,
    _weather:{ temp_c:31, raining:false, condition:"Hot & Clear (31°C)" },
    _demo_path:"HEAT-TRIGGERED REFRIGERATED (31°C > 26°C limit)",
  },
  {
    id:"O-DIST", label:"Ambul Banana (Long Route)",
    fruit_type:"Banana", fruit_variant:"Ambul",
    quantity:300,
    pickup_location:"Colombo Central Hub", pickup_lat:6.9271, pickup_lng:79.8612,
    drop_location:"Hambantota Port",       drop_lat:6.1429,  drop_lng:81.1212,
    _weather:{ temp_c:22, raining:false, condition:"Mild & Clear (22°C)" },
    _demo_path:"DISTANCE-TRIGGERED REFRIGERATED + SHIFT LIMIT → 3PL OVERFLOW",
  },
  {
    id:"O-ETHYL", label:"Rathapapol Papaya",
    fruit_type:"Papaya", fruit_variant:"Rathapapol",
    quantity:600,
    pickup_location:"Akuressa North Farm", pickup_lat:6.105, pickup_lng:80.482,
    drop_location:"Weligama Center",       drop_lat:5.9736,  drop_lng:80.4283,
    _weather:{ temp_c:31, raining:false, condition:"Hot & Clear (31°C)" },
    _demo_path:"ETHYLENE PRODUCER CONFLICT — cannot share with sensitive fruits",
  },
  {
    id:"O-RAIN", label:"Pineapple (Rainy Day)",
    fruit_type:"Pineapple", fruit_variant:"All",
    quantity:1200,
    pickup_location:"Deniyaya Hills Farm", pickup_lat:6.3392, pickup_lng:80.5647,
    drop_location:"Matara Warehouse",      drop_lat:5.955,   drop_lng:80.535,
    _weather:{ temp_c:25, raining:true, condition:"Heavy Rain (25°C)" },
    _demo_path:"RAIN-TRIGGERED COVERED vehicle",
  },
  {
    id:"O-UNCOV", label:"Pineapple (Fine Day)",
    fruit_type:"Pineapple", fruit_variant:"All",
    quantity:1800,
    pickup_location:"Kotapola Farm",  pickup_lat:6.183,  pickup_lng:80.521,
    drop_location:"Matara Main Market", drop_lat:5.9522, drop_lng:80.5376,
    _weather:{ temp_c:31, raining:false, condition:"Hot & Clear (31°C)" },
    _demo_path:"UNCOVERED optimal — cheapest vehicle preference",
  },
];

// ── SECTION 3: UTILITIES ─────────────────────────────────────────────────────

const ROAD_FACTOR  = 1.3;
const MAX_SHIFT    = 600;
const MINS_PER_STOP = 30;

function haversineKm(lat1,lon1,lat2,lon2) {
  if (!lat1||!lon1||!lat2||!lon2) return 0;
  const R=6371, dLat=(lat2-lat1)*Math.PI/180, dLon=(lon2-lon1)*Math.PI/180;
  const a=Math.sin(dLat/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return Math.round(R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))*10)/10;
}

function roadKm(lat1,lng1,lat2,lng2) {
  return Math.round(haversineKm(lat1,lng1,lat2,lng2)*ROAD_FACTOR*10)/10;
}

function ok(msg)   { return `${C.green}✓${C.reset} ${msg}`; }
function fail(msg) { return `${C.red}✗${C.reset} ${msg}`; }
function warn(msg) { return `${C.yellow}⚠${C.reset} ${msg}`; }

function pad(s,n,right=false) {
  const str=String(s); return right ? str.padEnd(n) : str.padStart(n);
}

// ── SECTION 4: ROUTE OPTIMISER (nearest-neighbour, minimal) ─────────────────

function buildManifest(orders, startLat, startLng) {
  let stops = [];
  orders.forEach(o => {
    stops.push({ key:`PICK-${o.id}`, type:"PICKUP",  orderId:o.id, lat:o._algo.pLat, lng:o._algo.pLng, qty:o.allocated_quantity, loc:o.pickup_location });
    stops.push({ key:`DROP-${o.id}`,  type:"DROP",    orderId:o.id, lat:o._algo.dLat, lng:o._algo.dLng, qty:o.allocated_quantity, loc:o.drop_location  });
  });
  let route=[], onboard=new Set(), cur={lat:startLat,lng:startLng,key:"START"};
  while (stops.length>0) {
    const cands = stops.filter(s=>s.type==="PICKUP"||onboard.has(s.orderId));
    if (!cands.length) break;
    let best=null, bestD=Infinity;
    for (const s of cands) {
      const d=haversineKm(cur.lat,cur.lng,s.lat,s.lng);
      if (d<bestD) { bestD=d; best=s; }
    }
    const km=roadKm(cur.lat,cur.lng,best.lat,best.lng);
    route.push({ seq:route.length+1, type:best.type, location:best.loc, order_id:best.orderId, qty:best.qty, dist_km:km, dur_min:Math.round((km/40)*60) });
    cur=best;
    if (best.type==="PICKUP") onboard.add(best.orderId);
    stops=stops.filter(s=>s.key!==best.key);
  }
  return route;
}

// ── SECTION 5: DEMO ENGINE WITH VERBOSE LOGGING ──────────────────────────────

async function runDemo() {
  const paths_hit = [];

  // ────────────────────────────────────────────────────────────────────────────
  console.log(`\n${C.bold}${C.cyan}${bar()}${C.reset}`);
  console.log(`${C.bold}${C.cyan}  FRESHROTE LOGISTICS ENGINE — ALGORITHM DEMONSTRATION${C.reset}`);
  console.log(`${C.bold}${C.cyan}${bar()}${C.reset}`);
  console.log(`${C.dim}  Self-contained demo. Covers all 14 algorithm decision paths.${C.reset}`);

  // ── INPUT DATA ──────────────────────────────────────────────────────────────
  console.log(`\n${C.bold}${C.blue}  ── INPUT DATA ${thin("─").slice(0,57)}${C.reset}`);
  console.log(`\n  ${C.bold}Fleet (${FLEET.length} vehicles):${C.reset}`);
  console.log(`  ${"ID".padEnd(4)} ${"Licence".padEnd(14)} ${"Type".padEnd(14)} ${"Capacity"}`);
  console.log(`  ${thin("─").slice(0,50)}`);
  FLEET.forEach(v=>console.log(`  ${v.id.padEnd(4)} ${v.vehicle_license_plate.padEnd(14)} ${v.vehicle_type.padEnd(14)} ${v.capacity_kg} kg`));

  console.log(`\n  ${C.bold}Orders (${ORDERS.length} orders):${C.reset}`);
  console.log(`  ${"ID".padEnd(8)} ${"Fruit".padEnd(14)} ${"Qty".padStart(6)} ${"Route".padEnd(40)} ${"Demo Path"}`);
  console.log(`  ${thin("─").slice(0,100)}`);
  ORDERS.forEach(o=>console.log(
    `  ${o.id.padEnd(8)} ${(o.fruit_type+" "+o.fruit_variant).padEnd(14)} ${String(o.quantity+"kg").padStart(6)} ` +
    `${(o.pickup_location+"→"+o.drop_location).padEnd(40)} ${C.dim}${o._demo_path}${C.reset}`
  ));

  // ════════════════════════════════════════════════════════════════════════════
  console.log(`\n${C.bold}${C.cyan}${bar()}${C.reset}`);
  console.log(`${C.bold}${C.cyan}  PHASE 1 — DATA ENRICHMENT${C.reset}`);
  console.log(`${C.bold}${C.cyan}  Assessing route distance, weather & biological requirements per order${C.reset}`);
  console.log(`${C.bold}${C.cyan}${bar()}${C.reset}`);

  const enriched = [];
  for (const order of ORDERS) {
    const specs   = SPECS[order.fruit_variant];
    const weather = order._weather;
    const distKm  = roadKm(order.pickup_lat,order.pickup_lng,order.drop_lat,order.drop_lng);

    let reqType="UNCOVERED", reason="All conditions acceptable", strictness=1;

    if (specs.force_refrigeration) {
      reqType="REFRIGERATED"; reason=`force_refrigeration=true overrides all weather conditions`; strictness=3;
    } else if (weather.temp_c > specs.max_safe_temp_c) {
      reqType="REFRIGERATED"; reason=`temp ${weather.temp_c}°C > max_safe ${specs.max_safe_temp_c}°C`; strictness=3;
    } else if (distKm > specs.max_dist_uncooled_km) {
      reqType="REFRIGERATED"; reason=`route ${distKm}km > uncooled limit ${specs.max_dist_uncooled_km}km`; strictness=3;
    } else if (weather.raining) {
      reqType="COVERED"; reason=`rain forecast — water protection required`; strictness=2;
    }

    if (specs.force_refrigeration) {
      paths_hit.includes("PATH 1: Force refrigeration override") || paths_hit.push("PATH 1: Force refrigeration override");
    } else if (reqType==="REFRIGERATED" && weather.temp_c>specs.max_safe_temp_c) {
      paths_hit.includes("PATH 2: Heat-triggered REFRIGERATED") || paths_hit.push("PATH 2: Heat-triggered REFRIGERATED");
    } else if (reqType==="REFRIGERATED" && distKm>specs.max_dist_uncooled_km) {
      paths_hit.includes("PATH 3: Distance-triggered REFRIGERATED") || paths_hit.push("PATH 3: Distance-triggered REFRIGERATED");
    } else if (reqType==="COVERED") {
      paths_hit.includes("PATH 4: Rain-triggered COVERED") || paths_hit.push("PATH 4: Rain-triggered COVERED");
    } else {
      paths_hit.includes("PATH 5: UNCOVERED optimal selection") || paths_hit.push("PATH 5: UNCOVERED optimal selection");
    }

    const color = reqType==="REFRIGERATED"?C.cyan:reqType==="COVERED"?C.yellow:C.green;

    console.log(`\n  ${C.bold}[${order.id}]${C.reset} ${order.fruit_type} "${order.fruit_variant}"  │  ${order.quantity} kg`);
    console.log(`  Route  : ${order.pickup_location} → ${order.drop_location}`);
    console.log(`  Distance: ${distKm} km  │  Weather: ${weather.condition}`);
    if (specs.force_refrigeration)
      console.log(`  ${ok(`force_refrigeration = true`)}`);
    else
      console.log(`  Temp check   : ${weather.temp_c}°C vs max_safe ${specs.max_safe_temp_c}°C → ${weather.temp_c>specs.max_safe_temp_c?C.red+"EXCEEDS"+C.reset:C.green+"OK"+C.reset}`);
    if (!specs.force_refrigeration)
      console.log(`  Dist check   : ${distKm}km vs uncooled limit ${specs.max_dist_uncooled_km}km → ${distKm>specs.max_dist_uncooled_km?C.red+"EXCEEDS"+C.reset:C.green+"OK"+C.reset}`);
    if (!specs.force_refrigeration && weather.temp_c<=specs.max_safe_temp_c && distKm<=specs.max_dist_uncooled_km)
      console.log(`  Rain check   : ${weather.raining?C.yellow+"RAINING"+C.reset:C.green+"DRY"+C.reset}`);
    console.log(`  ${C.bold}▶ Decision: ${color}${reqType}${C.reset}  — ${reason}`);
    if (specs.ethylene_producer)  console.log(`  ${warn(`Ethylene PRODUCER — must not share enclosed truck with sensitive fruits`)}`);
    if (specs.ethylene_sensitive) console.log(`  ${warn(`Ethylene SENSITIVE — must not share enclosed truck with producer fruits`)}`);

    enriched.push({
      ...order,
      remainingQty: order.quantity,
      _algo:{ pLat:order.pickup_lat,pLng:order.pickup_lng,dLat:order.drop_lat,dLng:order.drop_lng,
              reqType, requiresCooling:reqType==="REFRIGERATED", strictness, specs }
    });
  }
  // Individual PATH 1-5 flags tracked inside the enrichment loop above

  // ════════════════════════════════════════════════════════════════════════════
  console.log(`\n${C.bold}${C.cyan}${bar()}${C.reset}`);
  console.log(`${C.bold}${C.cyan}  PHASE 2 — FFD TRIAGE SORT${C.reset}`);
  console.log(`${C.bold}${C.cyan}  Sorting orders: strictness DESC → max_safe_temp ASC → quantity DESC${C.reset}`);
  console.log(`${C.bold}${C.cyan}  (Hardest/most critical orders first — protects cold-chain access)${C.reset}`);
  console.log(`${C.bold}${C.cyan}${bar()}${C.reset}`);

  enriched.sort((a,b)=>{
    if (a._algo.strictness!==b._algo.strictness) return b._algo.strictness-a._algo.strictness;
    if (a._algo.specs.max_safe_temp_c!==b._algo.specs.max_safe_temp_c) return a._algo.specs.max_safe_temp_c-b._algo.specs.max_safe_temp_c;
    return b.quantity-a.quantity;
  });

  console.log();
  enriched.forEach((o,i)=>{
    const color=o._algo.reqType==="REFRIGERATED"?C.cyan:o._algo.reqType==="COVERED"?C.yellow:C.green;
    console.log(`  ${String(i+1).padStart(2)}. ${C.bold}[${o.id}]${C.reset} ${(o.fruit_type+" "+o.fruit_variant).padEnd(22)} `+
      `${color}${o._algo.reqType.padEnd(14)}${C.reset} strictness=${o._algo.strictness}  max_safe=${o._algo.specs.max_safe_temp_c}°C  qty=${o.quantity}kg`);
  });
  paths_hit.push("PATH 13: FFD sort ensures critical orders get priority fleet access");

  // ════════════════════════════════════════════════════════════════════════════
  //  PHASE 3 + 4: MULTI-WAVE LOOP
  // ════════════════════════════════════════════════════════════════════════════

  let fleetStatus = FLEET.map(v=>({
    ...v, remaining_capacity:v.capacity_kg, assigned_orders:[],
    has_ethylene_producer:false, has_ethylene_sensitive:false,
    is_reefer_on:false, operating_temp_c:null,
    minutes_worked:0, wave_est_minutes:0, is_shift_over:false, trips_completed:0,
  }));

  const scheduledJobs=[], overflowJobs=[];
  let pending = [...enriched];
  let waveNum  = 1;

  while (pending.length>0) {
    let packedAny=false;

    // Reset trucks for new wave
    for (const v of fleetStatus) {
      if (v.is_shift_over) continue;
      v.remaining_capacity=v.capacity_kg;
      v.assigned_orders=[];
      v.has_ethylene_producer=false;
      v.has_ethylene_sensitive=false;
      v.is_reefer_on=false;
      v.operating_temp_c=null;
      v.wave_est_minutes=0;
    }

    // ── PHASE 3 HEADER ──────────────────────────────────────────────────────
    console.log(`\n${C.bold}${C.cyan}${bar()}${C.reset}`);
    console.log(`${C.bold}${C.cyan}  PHASE 3 — WAVE ${waveNum} ALLOCATION${C.reset}`);
    console.log(`${C.bold}${C.cyan}  Bin-packing ${pending.filter(o=>o.remainingQty>0).length} pending order(s) into fleet with freshness constraints${C.reset}`);
    console.log(`${C.bold}${C.cyan}${bar()}${C.reset}`);

    for (const orderObj of pending) {
      if (orderObj.remainingQty<=0) continue;
      const {reqType,requiresCooling,specs} = orderObj._algo;

      while (orderObj.remainingQty>0) {
        const borderTop    = thin("─");
        const reqColor     = reqType==="REFRIGERATED"?C.cyan:reqType==="COVERED"?C.yellow:C.green;

        console.log(`\n  ${thin("─").slice(0,74)}`);
        console.log(`  ${C.bold}ORDER [${orderObj.id}]${C.reset}  ${orderObj.fruit_type} "${orderObj.fruit_variant}"  │  `+
          `${orderObj.remainingQty} kg remaining  │  Required: ${reqColor}${reqType}${C.reset}`);
        console.log(`  Pickup: ${orderObj.pickup_location}  →  Drop: ${orderObj.drop_location}`);
        if (specs.ethylene_producer)  console.log(`  ${C.magenta}Ethylene: PRODUCER${C.reset}`);
        if (specs.ethylene_sensitive) console.log(`  ${C.magenta}Ethylene: SENSITIVE  │  Optimal temp: ${specs.optimal_temp_c}°C  │  Safe range: ${specs.min_safe_temp_c}–${specs.max_safe_temp_c}°C${C.reset}`);
        console.log(`  Evaluating vehicles...`);

        let bestVehicle=null, bestScore=-Infinity, bestEst=0;

        for (const v of fleetStatus) {
          const avail = v.remaining_capacity>0 && !v.is_shift_over;
          const reeferStr = v.is_reefer_on ? `${v.operating_temp_c}°C` : "off";
          console.log(`\n    ${C.bold}[${v.id}] ${v.vehicle_license_plate}${C.reset}  │  ${v.vehicle_type}  │  ${v.remaining_capacity} kg available  │  Reefer: ${reeferStr}  │  Shift used: ${v.minutes_worked.toFixed(0)} min`);

          if (v.is_shift_over)         { console.log(`      ${fail("SHIFT OVER — driver has completed maximum shift")}`);         continue; }
          if (v.remaining_capacity<=0) { console.log(`      ${fail("CAPACITY — truck is full")}`);                                continue; }

          // Check 1: vehicle type
          if (reqType==="REFRIGERATED" && v.vehicle_type!=="REFRIGERATED") {
            console.log(`      ${fail(`TYPE — ${reqType} order requires REFRIGERATED truck; this is ${v.vehicle_type} → SKIP`)}`);
            paths_hit.includes("PATH 6: Vehicle type rejection") || paths_hit.push("PATH 6: Vehicle type rejection");
            continue;
          }
          if (reqType==="COVERED" && v.vehicle_type==="UNCOVERED") {
            console.log(`      ${fail(`TYPE — COVERED order cannot use UNCOVERED truck → SKIP`)}`);
            paths_hit.includes("PATH 6: Vehicle type rejection") || paths_hit.push("PATH 6: Vehicle type rejection");
            continue;
          }
          console.log(`      ${ok(`TYPE    — ${v.vehicle_type} vehicle meets ${reqType} requirement`)}`);

          // Check 2: ethylene (only for enclosed trucks)
          if (v.vehicle_type==="COVERED"||v.vehicle_type==="REFRIGERATED") {
            if (specs.ethylene_producer && v.has_ethylene_sensitive) {
              console.log(`      ${fail(`ETHYLENE — this order PRODUCES ethylene; truck carries ethylene-SENSITIVE fruit → CONFLICT → SKIP`)}`);
              paths_hit.includes("PATH 7: Ethylene producer blocked by sensitive") || paths_hit.push("PATH 7: Ethylene producer blocked by sensitive");
              continue;
            }
            if (specs.ethylene_sensitive && v.has_ethylene_producer) {
              console.log(`      ${fail(`ETHYLENE — this order is ethylene-SENSITIVE; truck carries ethylene-PRODUCING fruit → CONFLICT → SKIP`)}`);
              paths_hit.includes("PATH 7: Ethylene producer blocked by sensitive") || paths_hit.push("PATH 7: Ethylene producer blocked by sensitive");
              continue;
            }
            console.log(`      ${ok("ETHYLENE — no incompatible cargo in this truck")}`);
          }

          // Check 3: temperature
          if (v.vehicle_type==="REFRIGERATED" && v.is_reefer_on && v.operating_temp_c!==null) {
            const tooLow  = v.operating_temp_c < specs.min_safe_temp_c;
            const tooHigh = v.operating_temp_c > specs.max_safe_temp_c;
            if (tooLow || tooHigh) {
              const dir = tooLow ? `${v.operating_temp_c}°C < min_safe ${specs.min_safe_temp_c}°C` : `${v.operating_temp_c}°C > max_safe ${specs.max_safe_temp_c}°C`;
              console.log(`      ${fail(`TEMP    — reefer running at ${v.operating_temp_c}°C; ${orderObj.fruit_variant} needs ${specs.min_safe_temp_c}–${specs.max_safe_temp_c}°C; ${dir} → CONFLICT → SKIP`)}`);
              paths_hit.includes("PATH 8: Temperature conflict") || paths_hit.push("PATH 8: Temperature conflict");
              continue;
            }
            console.log(`      ${ok(`TEMP    — reefer ${v.operating_temp_c}°C is within safe range [${specs.min_safe_temp_c}–${specs.max_safe_temp_c}°C]`)}`);
          } else {
            console.log(`      ${ok("TEMP    — reefer not yet set; will configure on load")}`);
          }

          // Check 4: shift time
          const emptyKm  = roadKm(v.current_lat,v.current_lng,orderObj._algo.pLat,orderObj._algo.pLng);
          const loadedKm = roadKm(orderObj._algo.pLat,orderObj._algo.pLng,orderObj._algo.dLat,orderObj._algo.dLng);
          const travelKm = v.assigned_orders.length===0 ? emptyKm+loadedKm : loadedKm;
          const estMins  = Math.round((travelKm/40)*60)+(2*MINS_PER_STOP);
          const total    = v.minutes_worked+v.wave_est_minutes+estMins;

          if (total>MAX_SHIFT) {
            console.log(`      ${fail(`SHIFT   — est. trip ${estMins} min  |  worked ${v.minutes_worked.toFixed(0)} + committed ${v.wave_est_minutes.toFixed(0)} + new ${estMins} = ${total.toFixed(0)} > ${MAX_SHIFT} min → SKIP`)}`);
            paths_hit.includes("PATH 9: Shift limit rejection") || paths_hit.push("PATH 9: Shift limit rejection");
            continue;
          }
          console.log(`      ${ok(`SHIFT   — est. ${estMins} min  |  ${v.minutes_worked.toFixed(0)} + ${v.wave_est_minutes.toFixed(0)} + ${estMins} = ${total.toFixed(0)} ≤ ${MAX_SHIFT} min`)}`);

          // Scoring
          const typeScore = reqType===v.vehicle_type ? 100 : (v.vehicle_type==="REFRIGERATED"&&reqType!=="REFRIGERATED") ? 10 : 50;
          const loadAmt   = Math.min(orderObj.remainingQty,v.remaining_capacity);
          const utilScore = (loadAmt/v.capacity_kg)*50;
          const proxScore = Math.max(0,100-emptyKm);
          const score     = typeScore+utilScore+proxScore;
          const scoreStr  = `${C.bold}Score: ${score.toFixed(1)}${C.reset}  (type=${typeScore} util=${utilScore.toFixed(1)} proximity=${proxScore.toFixed(1)})`;

          if (score>bestScore) {
            bestScore=score; bestVehicle=v; bestEst=estMins;
            if (typeScore===10) {
              console.log(`      ${scoreStr}  ${C.yellow}← BEST (note: overqualified vehicle)${C.reset}`);
            } else if (reqType==="UNCOVERED" && v.vehicle_type==="UNCOVERED") {
              console.log(`      ${scoreStr}  ${C.green}← BEST (most economical match — avoids wasting fridge truck)${C.reset}`);
              paths_hit.includes("PATH 14: Cheapest vehicle scoring") || paths_hit.push("PATH 14: Cheapest vehicle scoring");
            } else {
              console.log(`      ${scoreStr}  ${C.green}← BEST${C.reset}`);
            }
          } else {
            console.log(`      ${scoreStr}`);
          }
        }

        if (!bestVehicle) {
          console.log(`\n    ${C.red}${C.bold}NO VEHICLE AVAILABLE — order cannot be allocated in Wave ${waveNum}${C.reset}`);
          if (waveNum>1) console.log(`    ${C.yellow}Will escalate to 3PL overflow if no wave resolves it.${C.reset}`);
          break;
        }

        const loadAmt = Math.min(orderObj.remainingQty, bestVehicle.remaining_capacity);
        const wasEmpty = bestVehicle.assigned_orders.length===0;
        orderObj.remainingQty        -= loadAmt;
        bestVehicle.remaining_capacity -= loadAmt;
        bestVehicle.wave_est_minutes   += bestEst;

        if (specs.ethylene_producer)  bestVehicle.has_ethylene_producer  = true;
        if (specs.ethylene_sensitive) bestVehicle.has_ethylene_sensitive = true;

        if (requiresCooling && !bestVehicle.is_reefer_on) {
          bestVehicle.is_reefer_on    = true;
          bestVehicle.operating_temp_c = specs.optimal_temp_c;
        }

        bestVehicle.assigned_orders.push({ ...orderObj, allocated_quantity:loadAmt });
        packedAny = true;

        const remainMsg = orderObj.remainingQty>0 ? `  ${C.yellow}(${orderObj.remainingQty}kg still unallocated — continues next pass)${C.reset}` : "";
        console.log(`\n    ${C.green}${C.bold}✅ ALLOCATED ${loadAmt} kg → [${bestVehicle.id}] ${bestVehicle.vehicle_license_plate}${C.reset}${remainMsg}`);
        if (requiresCooling && wasEmpty) console.log(`    ${C.cyan}Reefer activated at ${specs.optimal_temp_c}°C (optimal for ${orderObj.fruit_variant})${C.reset}`);
        if (specs.ethylene_producer)    console.log(`    ${C.magenta}Ethylene producer flag set on [${bestVehicle.id}]${C.reset}`);
        if (specs.ethylene_sensitive)   console.log(`    ${C.magenta}Ethylene sensitive flag set on [${bestVehicle.id}]${C.reset}`);

        if (loadAmt<orderObj.quantity && orderObj.remainingQty===0) {
          paths_hit.includes("PATH 10: Order splitting across trucks") || paths_hit.push("PATH 10: Order splitting across trucks");
        }
      }
    }

    if (!packedAny) break;

    // ── PHASE 4: MANIFEST ────────────────────────────────────────────────────
    console.log(`\n${C.bold}${C.cyan}${bar()}${C.reset}`);
    console.log(`${C.bold}${C.cyan}  PHASE 4 — WAVE ${waveNum} ROUTE OPTIMISATION${C.reset}`);
    console.log(`${C.bold}${C.cyan}  Nearest-neighbour construction with PICKUP-before-DROP constraint${C.reset}`);
    console.log(`${C.bold}${C.cyan}${bar()}${C.reset}`);

    for (const v of fleetStatus) {
      if (!v.assigned_orders.length) continue;
      const totalLoad = v.capacity_kg-v.remaining_capacity;
      const manifest  = buildManifest(v.assigned_orders, v.current_lat, v.current_lng);
      const driveMins = manifest.reduce((s,st)=>s+st.dur_min,0);
      const svcMins   = manifest.length*MINS_PER_STOP;
      const tripTime  = driveMins+svcMins;

      v.minutes_worked += tripTime;
      if (MAX_SHIFT-v.minutes_worked<120) v.is_shift_over=true;

      console.log(`\n  ${C.bold}[${v.id}] ${v.vehicle_license_plate}${C.reset}  │  ${v.vehicle_type}  │  Load: ${totalLoad} kg`);
      if (v.is_reefer_on) console.log(`  Reefer: ${v.operating_temp_c}°C`);
      console.log(`  ${"Seq".padStart(3)}  ${"Type".padEnd(7)}  ${"Location".padEnd(30)}  ${"km".padStart(6)}  ${"min".padStart(5)}`);
      console.log(`  ${thin("─").slice(0,60)}`);
      manifest.forEach(s=>{
        const icon=s.type==="PICKUP"?`${C.green}▲ PICK${C.reset}`:`${C.red}▼ DROP${C.reset}`;
        console.log(`  ${String(s.seq).padStart(3)}  ${icon}   ${s.location.padEnd(30)}  ${String(s.dist_km).padStart(6)}  ${String(s.dur_min).padStart(5)}`);
      });
      console.log(`  ${thin("─").slice(0,60)}`);
      console.log(`  Drive: ${driveMins} min  │  Service (${manifest.length} stops × ${MINS_PER_STOP} min): ${svcMins} min  │  Total trip: ${tripTime} min`);
      console.log(`  Cumulative shift used: ${v.minutes_worked.toFixed(0)} / ${MAX_SHIFT} min${v.is_shift_over?" "+C.red+"[SHIFT COMPLETE]"+C.reset:""}`);

      scheduledJobs.push({
        wave:waveNum, vehicle_id:v.id, licence:v.vehicle_license_plate,
        vehicle_type:v.vehicle_type, total_weight_kg:totalLoad,
        cooling_unit_on:v.is_reefer_on, set_temperature_c:v.operating_temp_c,
        route_manifest:manifest, trip_time_mins:tripTime,
        order_ids:[...new Set(v.assigned_orders.map(o=>o.id))],
      });

      v.trips_completed++;
      if (manifest.length>0) { const last=manifest[manifest.length-1]; v.current_lat=last.lat??v.current_lat; }
    }

    pending = pending.filter(o=>o.remainingQty>0);
    if (pending.length>0) {
      paths_hit.includes("PATH 11: Multi-wave reallocation") || paths_hit.push("PATH 11: Multi-wave reallocation");
      console.log(`\n  ${C.yellow}${pending.length} order(s) still unallocated — proceeding to Wave ${waveNum+1}${C.reset}`);
    }
    waveNum++;
  }

  // ── PHASE 5: 3PL OVERFLOW ──────────────────────────────────────────────────
  console.log(`\n${C.bold}${C.cyan}${bar()}${C.reset}`);
  console.log(`${C.bold}${C.cyan}  PHASE 5 — 3PL OVERFLOW${C.reset}`);
  console.log(`${C.bold}${C.cyan}  Orders that could not be allocated to internal fleet${C.reset}`);
  console.log(`${C.bold}${C.cyan}${bar()}${C.reset}`);

  if (pending.length===0) {
    console.log(`\n  ${C.green}${C.bold}All orders allocated internally. No 3PL required.${C.reset}`);
  } else {
    const totalOverflow = pending.reduce((s,o)=>s+o.remainingQty,0);
    paths_hit.includes("PATH 12: 3PL overflow") || paths_hit.push("PATH 12: 3PL overflow");
    console.log(`\n  ${C.red}${C.bold}${pending.length} order(s) sent to 3PL subcontractor:${C.reset}`);
    pending.forEach(o=>{
      console.log(`\n  [${o.id}] ${o.fruit_type} "${o.fruit_variant}"  │  ${o.remainingQty} kg`);
      console.log(`  Route: ${o.pickup_location} → ${o.drop_location}`);
      console.log(`  ${C.red}Reason: Exceeded driver shift limit on all vehicles (no viable allocation found)${C.reset}`);
    });
    console.log(`\n  Total overflow weight : ${totalOverflow} kg`);
    console.log(`  Status                : REQUIRES_ADMIN_ASSIGNMENT`);
    overflowJobs.push(...pending);
  }

  // ── FINAL SUMMARY ──────────────────────────────────────────────────────────
  console.log(`\n${C.bold}${C.cyan}${bar()}${C.reset}`);
  console.log(`${C.bold}${C.cyan}  FINAL ALLOCATION SUMMARY${C.reset}`);
  console.log(`${C.bold}${C.cyan}${bar()}${C.reset}\n`);

  const totalOrdered   = ORDERS.reduce((s,o)=>s+o.quantity,0);
  const totalAllocated = scheduledJobs.reduce((s,j)=>s+j.total_weight_kg,0);
  const totalOverflowW = overflowJobs.reduce((s,o)=>s+o.remainingQty,0);
  const wavesUsed      = waveNum-1;

  console.log(`  ${"Wave".padEnd(5)} ${"Vehicle".padEnd(14)} ${"Type".padEnd(14)} ${"Load".padStart(8)} ${"Reefer".padEnd(10)} ${"Trip".padStart(8)}  Orders`);
  console.log(`  ${thin("─").slice(0,80)}`);
  scheduledJobs.forEach(j=>{
    const reefer = j.cooling_unit_on ? `${j.set_temperature_c}°C` : "off";
    console.log(`  ${String(j.wave).padEnd(5)} ${j.licence.padEnd(14)} ${j.vehicle_type.padEnd(14)} ${String(j.total_weight_kg+"kg").padStart(8)} ${reefer.padEnd(10)} ${String(j.trip_time_mins+"min").padStart(8)}  ${j.order_ids.join(", ")}`);
  });
  if (overflowJobs.length>0) {
    overflowJobs.forEach(o=>{
      console.log(`  ${"3PL".padEnd(5)} ${"EXTERNAL".padEnd(14)} ${"SUBCONTRACT".padEnd(14)} ${String(o.remainingQty+"kg").padStart(8)} ${"—".padEnd(10)} ${"—".padStart(8)}  ${o.id}`);
    });
  }
  console.log(`  ${thin("─").slice(0,80)}`);
  console.log(`\n  Total ordered   : ${totalOrdered} kg`);
  console.log(`  Total allocated : ${C.green}${totalAllocated} kg${C.reset}  (${(totalAllocated/totalOrdered*100).toFixed(1)}%)`);
  console.log(`  3PL overflow    : ${totalOverflowW>0?C.red:C.green}${totalOverflowW} kg${C.reset}  (${(totalOverflowW/totalOrdered*100).toFixed(1)}%)`);
  console.log(`  Waves processed : ${wavesUsed}`);
  console.log(`  Scheduled jobs  : ${scheduledJobs.length}`);

  // ── PATHS COVERED ──────────────────────────────────────────────────────────
  console.log(`\n${C.bold}${C.cyan}${bar()}${C.reset}`);
  console.log(`${C.bold}${C.cyan}  ALGORITHM PATHS DEMONSTRATED${C.reset}`);
  console.log(`${C.bold}${C.cyan}${bar()}${C.reset}\n`);

  const ALL_PATHS = [
    ["PATH 1: Force refrigeration override",          "O-FORCE: TJC Mango in 15°C cool weather — force_refrigeration=true overrides"],
    ["PATH 2: Heat-triggered REFRIGERATED",           "O-HEAT: Ambul Banana — 31°C > max_safe 26°C forces cold chain"],
    ["PATH 3: Distance-triggered REFRIGERATED",       "O-DIST: Colombo→Hambantota — route 213km > uncooled limit 60km"],
    ["PATH 4: Rain-triggered COVERED",                "O-RAIN: Pineapple — rain forecast requires enclosed vehicle"],
    ["PATH 5: UNCOVERED optimal selection",           "O-UNCOV: Pineapple — all conditions fine, cheapest truck used"],
    ["PATH 6: Vehicle type rejection",                "COVERED/UNCOVERED trucks rejected when REFRIGERATED is required"],
    ["PATH 7: Ethylene producer blocked by sensitive","Ambul Banana (producer) blocked from truck carrying sensitive fruit"],
    ["PATH 8: Temperature conflict",                  "TJC Mango (min 12°C) blocked from truck set to 4°C for Strawberry"],
    ["PATH 9: Shift limit rejection",                 "O-DIST Colombo→Hambantota — est. journey >600 min, all trucks reject"],
    ["PATH 10: Order splitting across trucks",        "O-SPLIT: 3500 kg TJC Mango split across multiple vehicles"],
    ["PATH 11: Multi-wave reallocation",              "Ethylene/temp-blocked orders retry in next wave after truck resets"],
    ["PATH 12: 3PL overflow",                         "O-DIST: no internal vehicle can serve it — escalated to subcontractor"],
    ["PATH 13: FFD sort priority",                    "Strawberry (strictness=3, max_safe=20) processed before all others"],
    ["PATH 14: Cheapest vehicle scoring",             "Pineapple scores UNCOVERED truck highest; avoids wasting fridge truck"],
  ];

  ALL_PATHS.forEach(([path, detail])=>{
    const hit = paths_hit.some(p=>p.includes(path.split(":")[0]));
    console.log(`  ${hit?C.green+"✓":C.red+"✗"}${C.reset} ${C.bold}${path}${C.reset}`);
    console.log(`    ${C.dim}${detail}${C.reset}`);
  });

  const covered = ALL_PATHS.filter(([p])=>paths_hit.some(ph=>ph.includes(p.split(":")[0]))).length;
  console.log(`\n  ${C.bold}${covered}/${ALL_PATHS.length} algorithm paths demonstrated${C.reset}`);
  console.log(`\n${C.bold}${C.cyan}${bar()}${C.reset}\n`);
}

runDemo().catch(console.error);
