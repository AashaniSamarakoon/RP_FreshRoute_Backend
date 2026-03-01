// Pricing helpers for FreshRoute price recommendations
function computeFreshRoutePrice({
  marketPrice,
  supplyKg,
  ordersKg,
  baseCostPerKg = 0,
  logisticsCostPerKg = 0,
  marginPct = 0.08,
  riskBufferPct = 0.02,
}) {
  const safeMarket = Number(marketPrice) || 0;
  const supply = Number(supplyKg) || 0;
  const orders = Number(ordersKg) || 0;
  const baseCost = Number(baseCostPerKg) || 0;
  const logisticsCost = Number(logisticsCostPerKg) || 0;

  const demandRatio = supply <= 0 ? 0 : orders / supply;
  const demandAdj = Math.min(Math.max(demandRatio - 1, -0.2), 0.35);
  const demandLift = safeMarket * 0.1 * (1 + demandAdj);

  const blendedMarket = safeMarket * 0.65;
  const preMargin = blendedMarket + baseCost + logisticsCost + demandLift;
  const recommended = preMargin * (1 + marginPct + riskBufferPct);

  return {
    recommendedPrice: Number(recommended.toFixed(2)),
    components: {
      blendedMarket: Number(blendedMarket.toFixed(2)),
      baseCost: Number(baseCost.toFixed(2)),
      logisticsCost: Number(logisticsCost.toFixed(2)),
      demandLift: Number(demandLift.toFixed(2)),
      marginPct,
      riskBufferPct,
    },
  };
}

module.exports = { computeFreshRoutePrice };
