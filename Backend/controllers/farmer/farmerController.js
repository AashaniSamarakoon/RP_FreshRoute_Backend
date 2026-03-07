const { supabase } = require("../../utils/supabaseClient");
const {
  computeFreshRoutePrice,
} = require("../../Services/farmer/pricingService");

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

// ============ LIVE MARKET PRICES (Dambulla) ============
async function getLiveMarketPrices(req, res) {
  try {
    const { location = "" } = req.query;
    const today = todayISO();
    const tomorrow = new Date(new Date(today).getTime() + 86400000)
      .toISOString()
      .split("T")[0];

    // 1) Try to fetch today's prices using timestamp range
    let query = supabase
      .from("economic_center_prices")
      .select(
        "fruit_id, fruit_name, variety, min_price, max_price, unit, captured_at, economic_center",
      )
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
        .select(
          "fruit_id, fruit_name, variety, min_price, max_price, unit, captured_at, economic_center",
        )
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

    const imageMap = Object.fromEntries(
      (fruitImages || []).map((f) => [f.name, f.image_url]),
    );

    // Map to frontend format with demand level mock
    const fruits = (data || []).map((p) => {
      const minPrice = p.min_price;
      const maxPrice = p.max_price;
      const avgPrice =
        minPrice != null && maxPrice != null
          ? (Number(minPrice) + Number(maxPrice)) / 2
          : null;

      // Format price display - show range if min != max, otherwise single price
      const priceDisplay =
        minPrice === maxPrice || maxPrice == null
          ? `Rs. ${Number(minPrice ?? avgPrice ?? 0).toFixed(2)}`
          : `Rs. ${Number(minPrice).toFixed(2)}-${Number(maxPrice).toFixed(2)}`;

      return {
        name: p.fruit_name,
        emoji:
          p.fruit_name === "Mango"
            ? "🥭"
            : p.fruit_name === "Banana"
              ? "🍌"
              : "🍍",
        image:
          imageMap[p.fruit_name] ||
          `https://via.placeholder.com/100?text=${p.fruit_name}`,
        price: priceDisplay,
        priceRange:
          minPrice === maxPrice ? null : { min: minPrice, max: maxPrice },
        avgPrice: avgPrice,
        unit: `/ ${p.unit}`,
        status: avgPrice > 300 ? "High" : avgPrice > 150 ? "Medium" : "Low",
        statusColor:
          avgPrice > 300 ? "#e8f4f0" : avgPrice > 150 ? "#fef9c3" : "#fee2e2",
      };
    });

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
    const startDate = new Date(Date.now() - daysBack * 86400000)
      .toISOString()
      .split("T")[0];

    let query = supabase
      .from("historical_market_prices")
      .select(
        "fruit_id, fruit_name, variety, min_price, max_price, unit, captured_at, economic_center",
      )
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
    (data || []).forEach((p) => {
      const date = p.captured_at.split("T")[0];
      const key = `${p.fruit_name}`;
      if (!grouped[key]) grouped[key] = [];
      const minPrice = p.min_price;
      const maxPrice = p.max_price;
      const avgPrice =
        minPrice != null && maxPrice != null
          ? (Number(minPrice) + Number(maxPrice)) / 2
          : null;
      grouped[key].push({
        date,
        price: avgPrice,
        unit: p.unit,
        min_price: minPrice,
        max_price: maxPrice,
      });
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
      .select("fruit_id, fruit_name, variety, min_price, max_price, unit")
      .eq("captured_at::date", today);

    if (error) throw error;

    // Format for frontend
    const fruits = (allFruits || []).map((f) => {
      const priceData = prices?.find((p) => p.fruit_id === f.id);

      if (!priceData) {
        return {
          name: f.name,
          image:
            f.image_url || `https://via.placeholder.com/100?text=${f.name}`,
          price: "N/A",
          unit: "/ kg",
          status: "N/A",
          delta: "0%",
          deltaColor: "#6b7280",
        };
      }

      const minPrice = priceData.min_price;
      const maxPrice = priceData.max_price;
      const avgPrice =
        minPrice != null && maxPrice != null
          ? (Number(minPrice) + Number(maxPrice)) / 2
          : null;

      const priceDisplay =
        minPrice === maxPrice || maxPrice == null
          ? `Rs. ${Number(minPrice ?? avgPrice ?? 0).toFixed(2)}`
          : `Rs. ${Number(minPrice).toFixed(2)}-${Number(maxPrice).toFixed(2)}`;

      return {
        name: f.name,
        variety: priceData.variety || f.variety || "Standard",
        price: priceDisplay,
        priceRange:
          minPrice === maxPrice ? null : { min: minPrice, max: maxPrice },
        avgPrice: avgPrice,
        image: f.image_url || `https://via.placeholder.com/100?text=${f.name}`,
        unit: `/ ${priceData.unit}`,
        status: avgPrice > 300 ? "High Demand" : "Stable",
        delta: "+3.2%",
        deltaColor: "#16a34a",
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
      {
        value: 92,
        label: "Overall Accuracy",
        trend: "up",
        change: "+4% this week",
      },
      {
        value: 88,
        label: "Price Prediction",
        trend: "up",
        change: "+2% this week",
      },
      {
        value: 95,
        label: "Demand Forecast",
        trend: "stable",
        change: "Stable",
      },
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

async function getHomeSummary(req, res) {
  try {
    const currentDate = todayISO();

    const [
      { data: forecastData, error: forecastError },
      { data: alerts, error: alertsError },
    ] = await Promise.all([
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
      avgConfidence: forecastData?.length ? null : null,
    };

    // Build greeting with user name
    const userName = req.user.first_name 
      ? `${req.user.first_name} ${req.user.last_name || ''}`.trim()
      : 'User';
    const greeting = `Good morning, ${userName}`;

    res.json({
      greeting,
      user_name: userName,
      spotlight: spotlightCard,
      quickMetrics,
      forecasts: forecastData || [],
    });
  } catch (err) {
    console.error("Home error", err);
    res.status(500).json({ message: "Server error" });
  }
}

async function getDailyPrices(req, res) {
  try {
    const { market_id } = req.query;
    if (!market_id) {
      return res.status(400).json({ message: "market_id is required" });
    }

    const [
      { data: marketPrices, error: marketErr },
      { data: frPrices, error: frErr },
    ] = await Promise.all([
      supabase
        .from("latest_market_prices")
        .select(
          "market_id, fruit_id, price_per_unit, demand_level, demand_trend, captured_at, fruits(name, variety, image_url)",
        )
        .eq("market_id", market_id),
      supabase
        .from("latest_freshroute_prices")
        .select(
          "market_id, fruit_id, target_date, recommended_price, supply_kg, orders_kg, base_cost, logistics_cost, margin_pct, risk_buffer_pct, rationale, fruits(name, variety)",
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
      .select(
        "id, title, body, category, severity, action_url, read_at, created_at",
      )
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
    const order =
      sort === "top"
        ? { column: "rating", ascending: false }
        : { column: "created_at", ascending: false };

    const { data, error } = await supabase
      .from("feedback")
      .select("id, body, rating, status, created_at, user_id")
      .order(order.column, { ascending: order.ascending })
      .limit(50);

    if (error) {
      console.error("Feedback error", error);
      return res.status(500).json({ message: "Failed to fetch feedback" });
    }

    const feedbackRows = data || [];
    const userIds = [...new Set(feedbackRows.map((item) => item.user_id).filter(Boolean))];

    let usersById = {};
    if (userIds.length > 0) {
      const { data: userRows, error: usersError } = await supabase
        .from("users")
        .select("id, first_name, last_name")
        .in("id", userIds);

      if (usersError) {
        console.error("Feedback users lookup error", usersError);
      } else {
        usersById = (userRows || []).reduce((acc, user) => {
          const fullName = `${user.first_name || ""} ${user.last_name || ""}`.trim();
          acc[user.id] = {
            first_name: user.first_name || null,
            last_name: user.last_name || null,
            user_name: fullName || "User",
          };
          return acc;
        }, {});
      }
    }

    const feedbackWithUsers = feedbackRows.map((item) => {
      const userDetails = usersById[item.user_id] || {
        first_name: null,
        last_name: null,
        user_name: "User",
      };

      return {
        ...item,
        ...userDetails,
        user_uuid: item.user_id,
        user_id: userDetails.user_name,
      };
    });

    res.json({ feedback: feedbackWithUsers });
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
      .select("id, body, rating, status, created_at, user_id")
      .single();

    if (error) {
      console.error("Create feedback error", error);
      return res.status(500).json({ message: "Failed to submit feedback" });
    }

    const fullName = `${req.user.first_name || ""} ${req.user.last_name || ""}`.trim();
    const feedbackResponse = {
      ...data,
      first_name: req.user.first_name || null,
      last_name: req.user.last_name || null,
      user_name: fullName || "User",
      user_uuid: data.user_id,
      user_id: fullName || "User",
    };

    res.status(201).json({ feedback: feedbackResponse });
  } catch (err) {
    console.error("Create feedback server error", err);
    res.status(500).json({ message: "Server error" });
  }
}

module.exports = {
  getDashboard,
  getHomeSummary,
  getLiveMarketPrices,
  getDailyPrices,
  getDailyPricesV2,
  getAccuracyInsights,
  getNotifications,
  markNotificationRead,
  getFeedback,
  createFeedback,
  getHistoricalPrices,
};
