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
  PAID_PENDING_DELIVERY: { label: "Payment Confirmed",   phase: "payment"  },
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

    // 3. Supabase — fetch order linked to this harvest batch
    const { data: order } = await supabase
      .from("placed_orders")
      .select(
        "id, status, payment_status, quantity, fruit_type, variant, grade," +
        "farmer_share_amount, transporter_fee_amount, platform_fee_amount, total_amount," +
        "harvest_id, selected_farmer_id, distance_km," +
        "created_at, farmer_accepted_at, quality_confirmed_at, picked_up_at, updated_at"
      )
      .eq("harvest_id", batchId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Fetch stock + farmer in parallel
    const [stockRes, farmerRes] = await Promise.all([
      supabase
        .from("estimated_stock")
        .select("id, fruit_type, grade, quantity, estimated_harvest_date, image_hash, farmer_id")
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

    const stock  = stockRes.data;
    const farmer = farmerRes.data;

    if (!stock) {
      console.error("[PublicPortal] Stock not found. batchId:", batchId, "error:", stockRes.error?.message);
      return res.status(404).json({ error: "Batch not found" });
    }

    // 4. Fabric — parallel evaluate calls (errors are non-fatal)
    const harvestKey    = `HARVEST_${batchId}`;
    const fabricOrderId = order ? `ORDER_${order.id}` : null;

    const [fabricHarvest, fabricDelivery, fabricHistory] = await Promise.all([
      evalFabric("StockContract",    "ReadHarvest",        harvestKey).catch(() => null),
      fabricOrderId
        ? evalFabric("LogisticsContract", "GetDeliveryRecord", fabricOrderId).catch(() => null)
        : Promise.resolve(null),
      evalFabric("StockContract",    "GetHarvestHistory",  harvestKey).catch(() => []),
    ]);

    // 5. Freshness metrics
    const harvestDate      = stock.estimated_harvest_date
      || fabricHarvest?.harvestDate
      || null;
    const pickedUpAt       = order?.picked_up_at || fabricDelivery?.pickedUpAt || null;
    const deliveredAt      = order?.status === "COMPLETED" ? order?.updated_at : null;
    const farmToShelfHours = hoursBetween(harvestDate, deliveredAt || pickedUpAt);
    const transitHours     = hoursBetween(pickedUpAt, deliveredAt);
    const pickupDelayHours = order?.farmer_accepted_at
      ? hoursBetween(order.farmer_accepted_at, pickedUpAt)
      : null;

    // 6. Economics — percentage only, no absolute amounts
    const total  = order?.total_amount;
    const fShare = order?.farmer_share_amount;
    const economics = total && fShare ? {
      fairTradeCertified: true,
      farmerSharePercent: Math.round((fShare / total) * 1000) / 10,
    } : null;

    // 7. Timeline from Fabric transaction history
    const history = Array.isArray(fabricHistory) ? fabricHistory : [];
    const timeline = history.map((r) => {
      let parsed = {};
      try { parsed = r.value ? JSON.parse(r.value) : {}; } catch (_) { /* skip */ }
      const statusMeta = STATUS_EVENT_MAP[parsed.status] || {};
      return {
        txId:      r.txId,
        timestamp: r.timestamp,
        status:    parsed.status || null,
        label:     statusMeta.label || "Ledger Update",
        phase:     statusMeta.phase || "ledger",
      };
    });

    // 8. Build DTO — strip actor IDs and absolute financial amounts
    const currentStatus = order?.status || "HARVESTED";
    const statusMeta    = STATUS_EVENT_MAP[currentStatus] || {};

    const dto = {
      batchId,
      verifiedAt:   new Date().toISOString(),
      status:       currentStatus,
      currentPhase: statusMeta.phase || null,
      currentLabel: statusMeta.label || currentStatus,

      farm: {
        name:       farmer?.farm_name   || null,
        region:     farmer?.location    || null,
        displayBio: farmer?.display_bio || null,
      },

      harvest: {
        fruitType:     stock.fruit_type || fabricHarvest?.fruitId?.split("_")[0] || null,
        grade:         stock.grade      || fabricHarvest?.grade      || null,
        quantityKg:    stock.quantity   || fabricHarvest?.availableQuantity || null,
        harvestDate,
        qualityImages: Array.isArray(stock.image_hash)
          ? stock.image_hash.length
          : (stock.image_hash ? 1 : 0),
        blockchainTxId: history[0]?.txId || null,
      },

      journey: {
        createdAt:        order?.created_at         || null,
        farmerAcceptedAt: order?.farmer_accepted_at || null,
        pickedUpAt,
        deliveredAt,
        farmToShelfHours,
        transitHours,
        pickupDelayHours,
        freshnessRating:  freshnessRating(farmToShelfHours),
      },

      quality: fabricDelivery ? {
        score:       fabricDelivery.qualityScore    || null,
        condition:   fabricDelivery.stockCondition  || null,
        checkedAt:   fabricDelivery.pickedUpAt      || order?.quality_confirmed_at || null,
        vehicleType: fabricDelivery.vehicleType     || null,
      } : null,

      timeline,

      economics,

      verification: {
        blockchainNetwork: "Hyperledger Fabric",
        channel:           "freshroute-channel",
        chaincode:         "freshroute",
        harvestKey,
        txCount:           history.length,
      },
    };

    setCache(batchId, dto);
    return res.status(200).json(dto);

  } catch (err) {
    console.error("[PublicPortal] Error:", err.message);
    return res.status(500).json({ error: "Verification lookup failed" });
  }
};

module.exports = { getPublicBatch };
