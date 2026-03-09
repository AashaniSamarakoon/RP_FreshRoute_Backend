/**
 * publicController.js
 * Public Transparency Portal — GET /api/public/verify/:batchId
 * No authentication required. Rate-limited at the route level.
 *
 * Aggregates data from:
 *   - Supabase: placed_orders, estimated_stock, farmers
 *   - Hyperledger Fabric: StockContract + LogisticsContract (via public-reader wallet identity)
 *
 * Returns a privacy-safe DTO: strips actor UUIDs, strips absolute financial amounts,
 * exposes only farmer-share %, quality score, and freshness timeline.
 */

const { supabaseAdmin: supabase } = require("../../utils/supabaseClient");
const { getContract } = require("../../Services/blockchain/contractService");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const READER  = "public-reader"; // wallet/public-reader.id

// ── 60-second in-memory cache ───────────────────────────────────────────────
const cache = new Map();
const getCached = (k) => {
  const e = cache.get(k);
  return e && e.exp > Date.now() ? e.data : null;
};
const setCache = (k, d) => cache.set(k, { data: d, exp: Date.now() + 60_000 });

// ── Status → human label map (all 15 placed_orders statuses) ────────────────
const STATUS_EVENT_MAP = {
  OPEN:                  { label: "Order Posted",        phase: "order"    },
  PENDING_ACCEPTANCE:    { label: "Awaiting Farmer",     phase: "order"    },
  PENDING_FARMER:        { label: "Farmer Reviewing",    phase: "order"    },
  PENDING_BUYER:         { label: "Buyer Reviewing",     phase: "order"    },
  MATCHED:               { label: "Farmer Matched",      phase: "matching" },
  AWAITING_PAYMENT:      { label: "Awaiting Payment",    phase: "payment"  },
  AUTHORIZED_PAYMENT: { label: "Payment Confirmed",   phase: "payment"  },
  PACKING:               { label: "Farmer Packing",      phase: "handling" },
  READY_FOR_PICKUP:      { label: "Ready for Pickup",    phase: "handling" },
  IN_TRANSIT:            { label: "In Transit",           phase: "transit"  },
  DELIVERED:             { label: "Delivered",            phase: "delivery" },
  COMPLETED:             { label: "Completed",            phase: "delivery" },
  QUALITY_FAILED:        { label: "Quality Issue",        phase: "issue"    },
  CANCELLED:             { label: "Cancelled",            phase: "issue"    },
  DISPUTED:              { label: "Under Review",         phase: "issue"    },
};

// ── Helpers ──────────────────────────────────────────────────────────────────
const freshnessRating = (h) => {
  if (h === null || h === undefined) return null;
  if (h < 12) return "EXCELLENT";
  if (h < 24) return "GOOD";
  if (h < 48) return "FAIR";
  return "POOR";
};

const hoursBetween = (a, b) => {
  if (!a || !b) return null;
  return Math.round(Math.abs(new Date(b) - new Date(a)) / 36e5 * 10) / 10;
};

const evalFabric = async (contractName, fn, ...args) => {
  const { contract, close } = await getContract(READER, contractName);
  try {
    return JSON.parse(new TextDecoder().decode(await contract.evaluateTransaction(fn, ...args)));
  } finally {
    close();
  }
};


// helper that builds the DTO for a single harvest batch; used by multiple
// handlers (public, buyer, farmer). returns the DTO object or throws.
async function buildDto(batchId) {
  // 1. UUID validation
  if (!UUID_RE.test(batchId)) throw new Error("invalid-uuid");

  // Supabase fetch of order, stock, farmer etc. (same as previous body)
  const { data: order, error: orderError } = await supabase
    .from("placed_orders")
    .select(
      "id, status, payment_status, quantity, fruit_type, variant, grade," +
      "farmer_share_amount, transporter_fee_amount, platform_fee_amount, total_amount," +
      "harvest_id, selected_farmer_id," +
      "created_at, farmer_accepted_at, picked_up_at, updated_at"
    )
    .eq("harvest_id", batchId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (orderError) throw orderError;

  const [stockRes, farmerRes] = await Promise.all([
    supabase
      .from("estimated_stock")
      .select("id, fruit_type, grade, quantity, estimated_harvest_date, image_hash, farmer_id, created_at")
      .eq("id", batchId)
      .single(),
    order?.selected_farmer_id
      ? supabase
          .from("farmers")
          .select("user_id, location, farm_name, display_bio")
          .eq("user_id", order.selected_farmer_id)
          .single()
      : Promise.resolve({ data: null }),
  ]);

  const stock = stockRes.data;
  const farmer = farmerRes.data;
  const stockCreatedAt = stock?.created_at || null;
  if (!stock) throw new Error("not-found");

  const harvestKey = `HARVEST_${batchId}`;
  const fabricOrderId = order ? `ORDER_${order.id}` : null;

  const [fabricHarvest, fabricDelivery, fabricHistory] = await Promise.all([
    evalFabric("StockContract", "ReadHarvest", harvestKey).catch(() => null),
    fabricOrderId
      ? evalFabric("LogisticsContract", "GetDeliveryRecord", fabricOrderId).catch(() => null)
      : Promise.resolve(null),
    evalFabric("StockContract", "GetHarvestHistory", harvestKey).catch(() => []),
  ]);

  const harvestDate = stock.estimated_harvest_date || fabricHarvest?.harvestDate || null;
  const pickedUpAt = order?.picked_up_at || fabricDelivery?.pickedUpAt || null;
  const deliveredAt = order?.status === "COMPLETED" ? order?.updated_at : null;
  const farmToShelfHours = hoursBetween(harvestDate, deliveredAt || pickedUpAt);
  const transitHours = hoursBetween(pickedUpAt, deliveredAt);
  const pickupDelayHours = order?.farmer_accepted_at
    ? hoursBetween(order.farmer_accepted_at, pickedUpAt)
    : null;

  const total = order?.total_amount;
  const fShare = order?.farmer_share_amount;
  const economics = total && fShare ? {
    fairTradeCertified: true,
    farmerSharePercent: Math.round((fShare / total) * 1000) / 10,
  } : null;

  const history = Array.isArray(fabricHistory) ? fabricHistory : [];
  const timeline = history.map((r) => {
    let parsed = {};
    try { parsed = r.value ? JSON.parse(r.value) : {}; } catch (_) {}
    const statusMeta = STATUS_EVENT_MAP[parsed.status] || {};
    return {
      txId: r.txId,
      timestamp: r.timestamp,
      blockNumber: r.blockNumber || null,
      status: parsed.status || null,
      label: statusMeta.label || "Ledger Update",
      phase: statusMeta.phase || "ledger",
    };
  });

  // fetch missing block numbers asynchronously
  await Promise.all(
    timeline.map(async (e) => {
      if (!e.blockNumber && e.txId) {
        try {
          e.blockNumber = await getBlockNumberForTx(e.txId);
        } catch (__) {
          // ignore failures
        }
      }
    }),
  );

  const currentStatus = order?.status || "HARVESTED";
  const statusMeta = STATUS_EVENT_MAP[currentStatus] || {};
  const transactionIds = timeline.map((e) => e.txId).filter(Boolean);
  const blockNumbers = timeline.map((e) => e.blockNumber).filter((n) => n != null);

  return {
    batchId,
    verifiedAt: new Date().toISOString(),
    status: currentStatus,
    currentPhase: statusMeta.phase || null,
    currentLabel: statusMeta.label || currentStatus,

    farm: {
      name: farmer?.farm_name || null,
      region: farmer?.location || null,
      displayBio: farmer?.display_bio || null,
    },

    harvest: {
      fruitType: stock.fruit_type || fabricHarvest?.fruitId?.split("_")[0] || null,
      grade: stock.grade || fabricHarvest?.grade || null,
      quantityKg: stock.quantity || fabricHarvest?.availableQuantity || null,
      harvestDate,
      qualityImages: Array.isArray(stock.image_hash)
        ? stock.image_hash.length
        : (stock.image_hash ? 1 : 0),
      blockchainTxId: history[0]?.txId || null,
    },

    journey: {
      createdAt: order?.farmer_accepted_at || order?.created_at || stockCreatedAt || null,
      farmerAcceptedAt: order?.farmer_accepted_at || null,
      pickedUpAt,
      deliveredAt,
      farmToShelfHours,
      transitHours,
      pickupDelayHours,
      freshnessRating: freshnessRating(farmToShelfHours),
    },

    quality: fabricDelivery ? {
      score: fabricDelivery.qualityScore || null,
      condition: fabricDelivery.stockCondition || null,
      checkedAt: fabricDelivery.pickedUpAt || order?.quality_confirmed_at || null,
      vehicleType: fabricDelivery.vehicleType || null,
    } : null,

    timeline,
    economics,
    verification: {
      blockchainNetwork: "Hyperledger Fabric",
      channel: "freshroute-channel",
      chaincode: "freshroute",
      harvestKey,
      txCount: history.length,
      transactionIds,
      blockNumbers,
    },
  };
}

// helper to query block number given a txId
async function getBlockNumberForTx(txId) {
  const { network, close } = await getContract(READER, "freshroute");
  try {
    const channel = network.getChannel();
    try {
      const block = await channel.queryBlockByTxID(txId);
      const num = block.header.number;
      console.log(`[PublicPortal] block number for tx ${txId} -> ${num}`);
      return num != null ? num.toString() : null;
    } catch (err) {
      console.warn(`[PublicPortal] failed to query block for tx ${txId}:`, err.message);
      throw err;
    }
  } finally {
    close();
  }
}

// ── Main handler ─────────────────────────────────────────────────────────────
const getPublicBatch = async (req, res) => {
  try {
    const { batchId } = req.params;

    // 1. UUID validation — prevent spurious Fabric queries
    if (!UUID_RE.test(batchId))
      return res.status(400).json({ error: "Invalid batch ID format" });

    // 2. Cache hit
    const cached = getCached(batchId);
    if (cached) return res.status(200).json(cached);

    const dto = await buildDto(batchId);
    setCache(batchId, dto);
    return res.status(200).json(dto);
  } catch (err) {
    console.error("[PublicPortal] Error:", err.message);
    if (err.message === "not-found") {
      return res.status(404).json({ error: "Batch not found" });
    }
    return res.status(500).json({ error: "Verification lookup failed" });
  }
};



// ---------------------------------------------------------------------------
// Buyer / farmer specific variants
// ---------------------------------------------------------------------------

/**
 * GET /api/public/verify/by-buyer/:buyerId
 * returns the same DTO for every batch belonging to the buyer.
 * rate-limited like public endpoint but requires authentication in route.
 */
const getPublicByBuyer = async (req, res) => {
  try {
    const { buyerId } = req.params;
    if (!UUID_RE.test(buyerId))
      return res.status(400).json({ error: "Invalid buyer ID" });

    const { data: orders, error: ordErr } = await supabase
      .from("placed_orders")
      .select("harvest_id")
      .eq("buyer_id", buyerId)
      .order("created_at", { ascending: false });

    if (ordErr) {
      console.error("[PublicBuyer] fetch orders failed", ordErr.message);
      return res.status(500).json({ error: "Database error" });
    }

    const results = [];
    for (const o of orders) {
      if (o.harvest_id) {
        try {
          const dto = await buildDto(o.harvest_id);
          results.push(dto);
        } catch (e) {
          // ignore missing batches
          if (e.message !== "not-found") console.warn("buyer batch error", e.message);
        }
      }
    }

    return res.status(200).json({ buyerId, batches: results });
  } catch (err) {
    console.error("[PublicBuyer] Error:", err.message);
    return res.status(500).json({ error: "Lookup failed" });
  }
};

/**
 * GET /api/public/verify/by-farmer/:farmerId
 * similar to buyer version but filters on selected_farmer_id.
 */
const getPublicByFarmer = async (req, res) => {
  try {
    const { farmerId } = req.params;
    if (!UUID_RE.test(farmerId))
      return res.status(400).json({ error: "Invalid farmer ID" });

    const { data: orders, error: ordErr } = await supabase
      .from("placed_orders")
      .select("harvest_id")
      .eq("selected_farmer_id", farmerId)
      .order("created_at", { ascending: false });

    if (ordErr) {
      console.error("[PublicFarmer] fetch orders failed", ordErr.message);
      return res.status(500).json({ error: "Database error" });
    }

    const results = [];
    for (const o of orders) {
      if (o.harvest_id) {
        try {
          const dto = await buildDto(o.harvest_id);
          results.push(dto);
        } catch (e) {
          if (e.message !== "not-found") console.warn("farmer batch error", e.message);
        }
      }
    }

    return res.status(200).json({ farmerId, batches: results });
  } catch (err) {
    console.error("[PublicFarmer] Error:", err.message);
    return res.status(500).json({ error: "Lookup failed" });
  }
};

module.exports = { getPublicBatch, getPublicByBuyer, getPublicByFarmer };
