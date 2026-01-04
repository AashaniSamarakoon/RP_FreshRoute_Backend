const { supabase } = require("../../supabaseClient");
const { computeFreshRoutePrice } = require("../../services/farmer/pricingService");

const HOME_LIMIT = 3;

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// ============ DASHBOARD HOME ============
async function getDashboard(req, res) {
  try {
    const today = todayISO();

    // Get upcoming pickups (shipments) from simplified forecasts table
    const { data: shipments, error: shipErr } = await supabase
      .from("forecasts")
      .select("fruit, target, date, forecast_value")
      .gte("date", today)
      .order("date", { ascending: true })
      .limit(5);

    if (shipErr) {
      console.warn("Dashboard shipments query error", shipErr.message);
    }

    // Get quick stats
    const { count: statsCount, error: statsErr } = await supabase
      .from("forecasts")
      .select("id", { count: "exact", head: true });

    if (statsErr) {
      console.warn("Dashboard stats query error", statsErr.message);
    }

    const { data: alerts } = await supabase
      .from("notifications")
      .select("id")
      .eq("user_id", req.user.id)
      .is("read_at", null);

    res.json({
      message: "Dashboard loaded",
      upcomingPickups: shipments || [],
      stats: {
        totalShipments: statsCount || 0,
        spoilageReduced: 12, // Mock value
      },
    });
  } catch (err) {
    console.error("Dashboard error", err);
    res.status(500).json({ message: "Failed to load dashboard" });
  }
}

// ============ 7-DAY FORECAST ============
async function getForecast7Day(req, res) {
  try {
    const { fruit = "Mango", target = "demand" } = req.query; // target: 'demand' | 'price'
    const today = todayISO();
    const inSevenDays = new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];

    // Attempt to read from simplified forecast table: fruit, target, date, forecast_value
    try {
      const { data: simpleRows, error: simpleErr } = await supabase
        .from("forecasts")
        .select("fruit, target, date, forecast_value")
        .ilike("fruit", `%${fruit}%`)
        .eq("target", String(target).toLowerCase())
        .gte("date", today)
        .lte("date", inSevenDays)
        .order("date", { ascending: true });

      if (simpleErr) {
        console.warn("Simplified forecast query error", simpleErr.message);
        return res.json({ days: [], message: simpleErr.message });
      }

      if (simpleRows && simpleRows.length > 0) {
        let prev = null;
        const days = simpleRows.map((row) => {
          const valueNum = typeof row.forecast_value === "number" ? row.forecast_value : Number(row.forecast_value);
          let trend = "stable";
          if (prev !== null && typeof valueNum === "number") {
            trend = valueNum > prev ? "up" : valueNum < prev ? "down" : "stable";
          }
          prev = valueNum;
          return {
            day: new Date(row.date).toLocaleDateString("en-US", { weekday: "long" }),
            trend,
            trendText: trend === "up" ? "Increase" : trend === "down" ? "Decrease" : "Stable",
            value: typeof valueNum === "number" ? valueNum.toFixed(2) : "N/A",
            unit: target === "price" ? "Rs." : "units",
          };
        });

        return res.json({ days });
      }

      // Fallback: try alternate target from same table
      const altTarget = String(target).toLowerCase() === "price" ? "demand" : "price";
      const { data: altRows, error: altErr } = await supabase
        .from("forecasts")
        .select("fruit, target, date, forecast_value")
        .ilike("fruit", `%${fruit}%`)
        .eq("target", altTarget)
        .gte("date", today)
        .lte("date", inSevenDays)
        .order("date", { ascending: true });

      if (altErr) {
        console.warn("Alternate target query error", altErr.message);
        return res.json({ days: [], message: altErr.message });
      }

      if (altRows && altRows.length > 0) {
        let prevAlt = null;
        const daysAlt = altRows.map((row) => {
          const valueNum = typeof row.forecast_value === "number" ? row.forecast_value : Number(row.forecast_value);
          let trend = "stable";
          if (prevAlt !== null && typeof valueNum === "number") {
            trend = valueNum > prevAlt ? "up" : valueNum < prevAlt ? "down" : "stable";
          }
          prevAlt = valueNum;
          return {
            day: new Date(row.date).toLocaleDateString("en-US", { weekday: "long" }),
            trend,
            trendText: trend === "up" ? "Increase" : trend === "down" ? "Decrease" : "Stable",
            value: typeof valueNum === "number" ? valueNum.toFixed(2) : "N/A",
            unit: altTarget === "price" ? "Rs." : "units",
          };
        });

        return res.json({ days: daysAlt });
      }

      // No rows in either target for this window
      return res.json({ days: [] });
    } catch (e) {
      console.warn("Simplified forecast route error", e.message);
      // If simplified path fails unexpectedly, return empty set instead of 500
      return res.json({ days: [], message: e.message });
    }
  } catch (err) {
    console.error("Forecast error", err);
    // Return 200 with an empty set so the client does not break while we surface the message
    res.status(200).json({ days: [], message: err?.message || "Failed to fetch forecast" });
  }
}

// ============ LIVE MARKET PRICES (Dambulla) ============
async function getLiveMarketPrices(req, res) {
  try {
    const { location = "" } = req.query;
    const today = todayISO();
    const tomorrow = new Date(new Date(today).getTime() + 86400000).toISOString().split("T")[0];

    // 1) Try to fetch today's prices using timestamp range
    let query = supabase
      .from("economic_center_prices")
      .select("fruit_id, fruit_name, variety, price_per_unit, unit, captured_at, economic_center")
      .gte("captured_at", `${today}T00:00:00Z`)
      .lt("captured_at", `${tomorrow}T00:00:00Z`)
      .order("captured_at", { ascending: false })
      .limit(50);

    if (location) {
      query = query.ilike("economic_center", `%${location}%`);
    }

    let { data, error } = await query;
    if (error) throw error;

    // 2) If no rows for today, fall back to latest available
    let usedFallback = false;
    if (!data || data.length === 0) {
      usedFallback = true;
      query = supabase
        .from("economic_center_prices")
        .select("fruit_id, fruit_name, variety, price_per_unit, unit, captured_at, economic_center")
        .order("captured_at", { ascending: false })
        .limit(50);
      const fallback = await query;
      if (fallback.error) throw fallback.error;
      data = fallback.data;
    }

    // Get fruit images
    const { data: fruitImages } = await supabase
      .from("fruits")
      .select("id, name, image_url");

    const imageMap = Object.fromEntries((fruitImages || []).map(f => [f.name, f.image_url]));

    // Map to frontend format with demand level mock
    const fruits = (data || []).map(p => ({
      name: p.fruit_name,
      emoji: p.fruit_name === "Mango" ? "🥭" : p.fruit_name === "Banana" ? "🍌" : "🍍",
      image: imageMap[p.fruit_name] || `https://via.placeholder.com/100?text=${p.fruit_name}`,
      price: `Rs. ${p.price_per_unit.toFixed(2)}`,
      unit: `/ ${p.unit}`,
      status: p.price_per_unit > 300 ? "High" : p.price_per_unit > 150 ? "Medium" : "Low",
      statusColor: p.price_per_unit > 300 ? "#e8f4f0" : p.price_per_unit > 150 ? "#fef9c3" : "#fee2e2",
    }));

    res.json({
      location: location || data?.[0]?.economic_center || "",
      date: usedFallback ? undefined : today,
      lastUpdated: data?.[0]?.captured_at || new Date().toISOString(),
      fruits,
    });
  } catch (err) {
    console.error("Live market error", err);
    res.status(500).json({ message: "Failed to fetch market prices" });
  }
}

// ============ HISTORICAL PRICES ============
async function getHistoricalPrices(req, res) {
  try {
    const { days = 30, location = "", fruit = "" } = req.query;
    const daysBack = Math.min(Math.max(parseInt(days) || 30, 1), 365); // 1-365 days
    const startDate = new Date(Date.now() - daysBack * 86400000).toISOString().split("T")[0];

    let query = supabase
      .from("historical_market_prices")
      .select("fruit_id, fruit_name, variety, price_per_unit, unit, captured_at, economic_center")
      .gte("captured_at", `${startDate}T00:00:00Z`)
      .order("captured_at", { ascending: false })
      .limit(200);

    if (location) {
      query = query.ilike("economic_center", `%${location}%`);
    }

    if (fruit) {
      query = query.ilike("fruit_name", `%${fruit}%`);
    }

    const { data, error } = await query;
    if (error) throw error;

    // Group by date and fruit for trend analysis
    const grouped = {};
    (data || []).forEach(p => {
      const date = p.captured_at.split("T")[0];
      const key = `${p.fruit_name}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push({ date, price: p.price_per_unit, unit: p.unit });
    });

    res.json({
      location: location || "All",
      fruit: fruit || "All",
      daysBack,
      totalRecords: data?.length || 0,
      trends: grouped,
    });
  } catch (err) {
    console.error("Historical prices error", err);
    res.status(500).json({ message: "Failed to fetch historical prices" });
  }
}

// ============ DAILY PRICES (FreshRoute Recommended) ============
async function getDailyPricesV2(req, res) {
  try {
    const today = todayISO();

    // Get all fruits with their images
    const { data: allFruits } = await supabase
      .from("fruits")
      .select("id, name, variety, image_url");

    // Get economic center prices for today
    const { data: prices, error } = await supabase
      .from("economic_center_prices")
      .select("fruit_id, fruit_name, variety, price_per_unit, unit")
      .eq("captured_at::date", today);

    if (error) throw error;

    // Format for frontend
    const fruits = (allFruits || []).map(f => {
      const priceData = prices?.find(p => p.fruit_id === f.id);
      return {
        name: f.name,
        variety: priceData?.variety || f.variety || "Standard",
        price: priceData ? `Rs. ${priceData.price_per_unit.toFixed(2)}` : "N/A",
        unit: `/ ${priceData?.unit || "kg"}`,
        status: priceData ? (priceData.price_per_unit > 300 ? "High Demand" : "Stable") : "N/A",
        delta: "+3.2%",
        deltaColor: "#16a34a",
        image: f.image_url || `https://via.placeholder.com/120?text=${f.name}`,
      };
    });

    res.json({
      date: today,
      fruits,
    });
  } catch (err) {
    console.error("Daily prices error", err);
    res.status(500).json({ message: "Failed to fetch daily prices" });
  }
}

// ============ ACCURACY INSIGHTS ============
async function getAccuracyInsights(req, res) {
  try {
    // Get recent forecasts and compare with actuals
    const { data, error } = await supabase
      .from("forecasts")
      .select("fruit, target, date, forecast_value")
      .order("date", { ascending: false })
      .limit(100);

    if (error) throw error;

    // Mock accuracy calculations
    const accuracy = {
      overall: 92,
      price: 88,
      demand: 95,
    };

    const metrics = [
      { value: 92, label: "Overall Accuracy", trend: "up", change: "+4% this week" },
      { value: 88, label: "Price Prediction", trend: "up", change: "+2% this week" },
      { value: 95, label: "Demand Forecast", trend: "stable", change: "Stable" },
    ];

    res.json({
      accuracy: accuracy.overall,
      accuracyLabel: "Overall Accuracy",
      metrics,
    });
  } catch (err) {
    console.error("Accuracy insights error", err);
    res.status(500).json({ message: "Failed to fetch accuracy data" });
  }
}

// ============ FRUIT-SPECIFIC FORECAST ============
async function getFruitForecast(req, res) {
  try {
    const { fruit = "Mango" } = req.query;
    const today = todayISO();
    const inSevenDays = new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];

    const { data, error } = await supabase
      .from("forecasts")
      .select("fruit, target, date, forecast_value")
      .ilike("fruit", `%${fruit}%`)
      .gte("date", today)
      .lte("date", inSevenDays)
      .order("date", { ascending: true });

    if (error) throw error;

    res.json({
      fruit,
      forecast: data || [],
      peakDay: data?.[0]?.date || null,
      peakDemand: data?.[0]?.forecast_value || null,
    });
  } catch (err) {
    console.error("Fruit forecast error", err);
    res.status(500).json({ message: "Failed to fetch fruit forecast" });
  }
}

async function getHomeSummary(req, res) {
  try {
    const currentDate = todayISO();

    const [{ data: forecastData, error: forecastError }, { data: alerts, error: alertsError }] = await Promise.all([
      supabase
        .from("forecasts")
        .select("fruit, target, date, forecast_value")
        .gte("date", currentDate)
        .order("date", { ascending: false })
        .limit(HOME_LIMIT),
      supabase
        .from("notifications")
        .select("id")
        .eq("user_id", req.user.id)
        .is("read_at", null),
    ]);

    if (forecastError || alertsError) {
      const err = forecastError || alertsError;
      console.error("Home fetch error", err);
      return res.status(500).json({ message: "Failed to load home data" });
    }

    const spotlight = forecastData?.[0];
    const spotlightCard = spotlight
      ? {
          fruit: spotlight.fruit,
          market: null,
          headline: `${spotlight.fruit || "Fruit"} forecast available`,
          summary: `Expected move on ${spotlight.date}: ${spotlight.target} ${spotlight.forecast_value}.`,
          updatedAt: spotlight.date,
        }
      : null;

    const quickMetrics = {
      openAlerts: alerts?.length || 0,
      trackedFruits: forecastData?.length || 0,
      avgConfidence:
        forecastData?.length ? null : null,
    };

    res.json({ spotlight: spotlightCard, quickMetrics, forecasts: forecastData || [] });
  } catch (err) {
    console.error("Home error", err);
    res.status(500).json({ message: "Server error" });
  }
}

async function getForecast(req, res) {
  try {
    const { fruit = "", target = "demand" } = req.query;
    if (!fruit) {
      return res.status(400).json({ message: "fruit is required" });
    }

    const { data, error } = await supabase
      .from("forecasts")
      .select("fruit, target, date, forecast_value")
      .ilike("fruit", `%${fruit}%`)
      .eq("target", String(target).toLowerCase())
      .gte("date", todayISO())
      .lte("date", new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10))
      .order("date", { ascending: true });

    if (error) {
      console.error("Forecast error", error);
      return res.status(500).json({ message: "Failed to fetch forecast" });
    }

    const days = (data || []).map((d) => ({
      day: new Date(d.date).toLocaleDateString("en-US", { weekday: "long" }),
      trend: "stable",
      trendText: "Stable",
      value: typeof d.forecast_value === "number" ? d.forecast_value.toFixed(2) : "N/A",
      unit: String(target).toLowerCase() === "price" ? "Rs." : "units",
    }));

    res.json({ days });
  } catch (err) {
    console.error("Forecast server error", err);
    res.status(500).json({ message: "Server error" });
  }
}

async function getDailyPrices(req, res) {
  try {
    const { market_id } = req.query;
    if (!market_id) {
      return res.status(400).json({ message: "market_id is required" });
    }

    const [{ data: marketPrices, error: marketErr }, { data: frPrices, error: frErr }] = await Promise.all([
      supabase
        .from("latest_market_prices")
        .select("market_id, fruit_id, price_per_unit, demand_level, demand_trend, captured_at, fruits(name, variety, image_url)")
        .eq("market_id", market_id),
      supabase
        .from("latest_freshroute_prices")
        .select(
          "market_id, fruit_id, target_date, recommended_price, supply_kg, orders_kg, base_cost, logistics_cost, margin_pct, risk_buffer_pct, rationale, fruits(name, variety)"
        )
        .eq("market_id", market_id),
    ]);

    if (marketErr || frErr) {
      console.error("Daily prices error", marketErr || frErr);
      return res.status(500).json({ message: "Failed to fetch prices" });
    }

    const combined = (marketPrices || []).map((row) => {
      const match = (frPrices || []).find((p) => p.fruit_id === row.fruit_id);
      const { recommendedPrice, components } = computeFreshRoutePrice({
        marketPrice: row.price_per_unit,
        supplyKg: match?.supply_kg,
        ordersKg: match?.orders_kg,
        baseCostPerKg: match?.base_cost,
        logisticsCostPerKg: match?.logistics_cost,
        marginPct: match?.margin_pct,
        riskBufferPct: match?.risk_buffer_pct,
      });

      return {
        fruit_id: row.fruit_id,
        fruit: row.fruits?.name,
        variety: row.fruits?.variety,
        image_url: row.fruits?.image_url,
        market_price: row.price_per_unit,
        demand_level: row.demand_level,
        demand_trend: row.demand_trend,
        captured_at: row.captured_at,
        freshroute: {
          target_date: match?.target_date,
          recommended_price: match?.recommended_price ?? recommendedPrice,
          breakdown: components,
          rationale: match?.rationale,
        },
      };
    });

    res.json({ prices: combined });
  } catch (err) {
    console.error("Daily prices server error", err);
    res.status(500).json({ message: "Server error" });
  }
}

async function getNotifications(req, res) {
  try {
    const { category } = req.query;
    let query = supabase
      .from("notifications")
      .select("id, title, body, category, severity, action_url, read_at, created_at")
      .eq("user_id", req.user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (category) {
      query = query.eq("category", category);
    }

    const { data, error } = await query;
    if (error) {
      console.error("Notifications error", error);
      return res.status(500).json({ message: "Failed to fetch notifications" });
    }

    res.json({ notifications: data || [] });
  } catch (err) {
    console.error("Notifications server error", err);
    res.status(500).json({ message: "Server error" });
  }
}

async function markNotificationRead(req, res) {
  try {
    const { id } = req.params;
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", req.user.id);

    if (error) {
      console.error("Mark read error", error);
      return res.status(500).json({ message: "Failed to update notification" });
    }

    res.json({ message: "updated" });
  } catch (err) {
    console.error("Mark read server error", err);
    res.status(500).json({ message: "Server error" });
  }
}

async function getFeedback(req, res) {
  try {
    const { sort = "recent" } = req.query;
    const order = sort === "top" ? { column: "rating", ascending: false } : { column: "created_at", ascending: false };

    const { data, error } = await supabase
      .from("feedback")
      .select("id, body, rating, status, created_at, user_id")
      .order(order.column, { ascending: order.ascending })
      .limit(50);

    if (error) {
      console.error("Feedback error", error);
      return res.status(500).json({ message: "Failed to fetch feedback" });
    }

    res.json({ feedback: data || [] });
  } catch (err) {
    console.error("Feedback server error", err);
    res.status(500).json({ message: "Server error" });
  }
}

async function createFeedback(req, res) {
  try {
    const { body, rating } = req.body;
    if (!body) {
      return res.status(400).json({ message: "Feedback text is required" });
    }

    const { data, error } = await supabase
      .from("feedback")
      .insert({ body, rating: rating ?? null, user_id: req.user.id })
      .select("id, body, rating, status, created_at")
      .single();

    if (error) {
      console.error("Create feedback error", error);
      return res.status(500).json({ message: "Failed to submit feedback" });
    }

    res.status(201).json({ feedback: data });
  } catch (err) {
    console.error("Create feedback server error", err);
    res.status(500).json({ message: "Server error" });
  }
}

module.exports = {
  getDashboard,
  getHomeSummary,
  getForecast,
  getForecast7Day,
  getLiveMarketPrices,
  getDailyPrices,
  getDailyPricesV2,
  getAccuracyInsights,
  getFruitForecast,
  getNotifications,
  markNotificationRead,
  getFeedback,
  createFeedback,
  getHistoricalPrices,
};
