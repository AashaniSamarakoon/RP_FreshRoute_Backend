// controllers/common/forecastController.js
// Shared forecast endpoints used by multiple roles (farmers, buyers, etc.)

const { supabase } = require("../../utils/supabaseClient");

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// GET /forecast/fruit?fruit=Mango
async function getFruitForecast(req, res) {
  try {
    const { fruit = "Mango" } = req.query;
    const today = todayISO();
    const inSevenDays = new Date(Date.now() + 7 * 86400000)
      .toISOString()
      .split("T")[0];

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

// GET /forecast?fruit=Mango&target=demand
async function getForecast(req, res) {
  try {
    const { fruit = "Mango", target = "demand" } = req.query;
    const today = todayISO();
    const inSevenDays = new Date(Date.now() + 7 * 86400000)
      .toISOString()
      .split("T")[0];

    const { data, error } = await supabase
      .from("forecasts")
      .select("fruit, target, date, forecast_value")
      .ilike("fruit", `%${fruit}%`)
      .eq("target", String(target).toLowerCase())
      .gte("date", today)
      .lte("date", inSevenDays)
      .order("date", { ascending: true });

    if (error) throw error;

    const days = (data || []).map((d) => ({
      day: new Date(d.date).toLocaleDateString("en-US", { weekday: "long" }),
      trend: "stable",
      trendText: "Stable",
      value:
        typeof d.forecast_value === "number"
          ? d.forecast_value.toFixed(2)
          : "N/A",
      unit: String(target).toLowerCase() === "price" ? "Rs." : "units",
    }));

    res.json({ days });
  } catch (err) {
    console.error("Forecast error", err);
    res
      .status(500)
      .json({ message: "Failed to fetch forecast", error: err.message });
  }
}

// GET /forecast/7day?fruit=Mango&target=demand
async function getForecast7Day(req, res) {
  try {
    const { fruit = "Mango", target = "demand" } = req.query;
    const today = todayISO();
    const inSevenDays = new Date(Date.now() + 7 * 86400000)
      .toISOString()
      .split("T")[0];

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
          const valueNum =
            typeof row.forecast_value === "number"
              ? row.forecast_value
              : Number(row.forecast_value);
          let trend = "stable";
          if (prev !== null && typeof valueNum === "number") {
            trend =
              valueNum > prev ? "up" : valueNum < prev ? "down" : "stable";
          }
          prev = valueNum;
          return {
            day: new Date(row.date).toLocaleDateString("en-US", {
              weekday: "long",
            }),
            trend,
            trendText:
              trend === "up"
                ? "Increase"
                : trend === "down"
                  ? "Decrease"
                  : "Stable",
            value: typeof valueNum === "number" ? valueNum.toFixed(2) : "N/A",
            unit: target === "price" ? "Rs." : "units",
          };
        });

        return res.json({ days });
      }

      const altTarget =
        String(target).toLowerCase() === "price" ? "demand" : "price";
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
          const valueNum =
            typeof row.forecast_value === "number"
              ? row.forecast_value
              : Number(row.forecast_value);
          let trend = "stable";
          if (prevAlt !== null && typeof valueNum === "number") {
            trend =
              valueNum > prevAlt
                ? "up"
                : valueNum < prevAlt
                  ? "down"
                  : "stable";
          }
          prevAlt = valueNum;
          return {
            day: new Date(row.date).toLocaleDateString("en-US", {
              weekday: "long",
            }),
            trend,
            trendText:
              trend === "up"
                ? "Increase"
                : trend === "down"
                  ? "Decrease"
                  : "Stable",
            value: typeof valueNum === "number" ? valueNum.toFixed(2) : "N/A",
            unit: altTarget === "price" ? "Rs." : "units",
          };
        });

        return res.json({ days: daysAlt });
      }

      return res.json({ days: [] });
    } catch (e) {
      console.warn("Simplified forecast route error", e.message);
      return res.json({ days: [], message: e.message });
    }
  } catch (err) {
    console.error("Forecast error", err);
    res
      .status(500)
      .json({ days: [], message: err?.message || "Failed to fetch forecast" });
  }
}

module.exports = {
  getFruitForecast,
  getForecast,
  getForecast7Day,
};
