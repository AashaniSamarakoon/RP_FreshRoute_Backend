/**
 * Accuracy Insights Service
 * Compares forecasted prices with actual historical market prices
 * Calculates overall and per-fruit accuracy metrics
 */

const { supabase } = require("../../utils/supabaseClient");

/**
 * Calculate accuracy metrics between predicted and actual prices
 * @returns {object} - Overall accuracy, per-fruit accuracy, and detailed comparison
 */
async function calculateAccuracyInsights() {
  try {
    const today = new Date();
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const todayISO = today.toISOString().split("T")[0];
    const sevenDaysAgoISO = sevenDaysAgo.toISOString().split("T")[0];

    console.log(`[Accuracy Insights] Analyzing prices from ${sevenDaysAgoISO} to ${todayISO}...`);

    // Step 1: Get last 7 days of actual historical prices
    const { data: historicalPrices, error: histErr } = await supabase
      .from("historical_market_prices")
      .select("id, fruit_id, fruit_name, min_price, max_price, captured_at, economic_center")
      .gte("captured_at", sevenDaysAgoISO)
      .lte("captured_at", todayISO)
      .order("captured_at", { ascending: false });

    if (histErr) throw histErr;

    if (!historicalPrices || historicalPrices.length === 0) {
      console.log("[Accuracy Insights] No historical prices found in last 7 days");
      return {
        message: "No data available for accuracy calculation",
        daysAnalyzed: 0,
        historicalRecordsFound: 0,
        overallAccuracy: null,
        perFruitAccuracy: {},
        details: [],
      };
    }

    // Get unique dates from historical data (these are the dates we have actual data for)
    const uniqueDates = [...new Set(historicalPrices.map(p => p.captured_at.split("T")[0]))];
    console.log(`[Accuracy Insights] Found actual prices for ${uniqueDates.length} days: ${uniqueDates.join(", ")}`);

    // Step 2: Get forecasted prices for these same dates
    const { data: forecasts, error: forecastErr } = await supabase
      .from("forecasts")
      .select("fruit, date, forecast_value, target")
      .in("date", uniqueDates)
      .eq("target", "price")
      .order("date", { ascending: false });

    if (forecastErr) throw forecastErr;

    console.log(`[Accuracy Insights] Found ${forecasts?.length || 0} forecasted prices for matching dates`);

    // Step 3: Calculate accuracy for each fruit-date combination
    const accuracyData = [];
    const fruitAccuracies = {};
    let totalAbsolutePercentError = 0;
    let totalComparisons = 0;

    for (const historical of historicalPrices) {
      // Find matching forecast (same fruit and date)
      const forecast = forecasts?.find(
        f => f.fruit?.toLowerCase().includes(historical.fruit_name.toLowerCase()) && 
             f.date === historical.captured_at.split("T")[0]
      );

      const actual = (historical.min_price + historical.max_price) / 2;

      if (forecast && forecast.forecast_value) {
        const predicted = forecast.forecast_value;
        
        // Calculate accuracy metrics
        const absoluteError = Math.abs(predicted - actual);
        const percentError = (absoluteError / actual) * 100;
        const accuracy = Math.max(0, 100 - percentError);

        accuracyData.push({
          fruit_id: historical.fruit_id,
          fruit_name: historical.fruit_name,
          market_date: historical.captured_at.split("T")[0],
          actual_price: Math.round(actual * 100) / 100,
          predicted_price: Math.round(predicted * 100) / 100,
          absolute_error: Math.round(absoluteError * 100) / 100,
          percent_error: Math.round(percentError * 100) / 100,
          accuracy: Math.round(accuracy * 100) / 100,
          prediction_source: forecast.target,
        });

        // Aggregate for overall accuracy
        totalAbsolutePercentError += percentError;
        totalComparisons++;

        // Aggregate per fruit
        if (!fruitAccuracies[historical.fruit_name]) {
          fruitAccuracies[historical.fruit_name] = {
            fruit_id: historical.fruit_id,
            fruit_name: historical.fruit_name,
            comparisons: 0,
            totalPercentError: 0,
            prices: [],
          };
        }

        fruitAccuracies[historical.fruit_name].comparisons++;
        fruitAccuracies[historical.fruit_name].totalPercentError += percentError;
        fruitAccuracies[historical.fruit_name].prices.push({
          date: historical.captured_at.split("T")[0],
          actual: Math.round(actual * 100) / 100,
          predicted: Math.round(predicted * 100) / 100,
          error: Math.round(percentError * 100) / 100,
        });
      } else {
        // No forecast available for this date
        const actual = (historical.min_price + historical.max_price) / 2;
        accuracyData.push({
          fruit_id: historical.fruit_id,
          fruit_name: historical.fruit_name,
          market_date: historical.captured_at.split("T")[0],
          actual_price: Math.round(actual * 100) / 100,
          predicted_price: null,
          absolute_error: null,
          percent_error: null,
          accuracy: null,
          prediction_source: "no_forecast_available",
        });
      }
    }

    // Step 4: Calculate overall accuracy
    const overallAccuracy = totalComparisons > 0 
      ? Math.round((100 - (totalAbsolutePercentError / totalComparisons)) * 100) / 100
      : null;

    // Step 5: Calculate per-fruit accuracy
    const perFruitAccuracy = {};
    const perFruitAccuracyList = [];
    Object.entries(fruitAccuracies).forEach(([fruitName, data]) => {
      const avgPercentError = data.totalPercentError / data.comparisons;
      const accuracy = Math.round((100 - avgPercentError) * 100) / 100;

      const entry = {
        fruit_id: data.fruit_id,
        fruit_name: fruitName,
        fruitName, // alias for frontend convenience
        comparisons: data.comparisons,
        comparisonsCount: data.comparisons, // alias
        average_percent_error: Math.round(avgPercentError * 100) / 100,
        averagePercentError: Math.round(avgPercentError * 100) / 100, // alias
        accuracy: accuracy,
        accuracyPercent: accuracy, // alias
        prices: data.prices,
      };

      perFruitAccuracy[fruitName] = entry;
      perFruitAccuracyList.push(entry);
    });

    // Step 6: Log summary
    const fruitsAnalyzed = Object.keys(perFruitAccuracy).length;

    console.log(`[Accuracy Insights] Analysis complete:`);
    console.log(`  - Days analyzed: ${uniqueDates.length}`);
    console.log(`  - Total comparisons: ${totalComparisons}`);
    console.log(`  - Overall accuracy: ${overallAccuracy}%`);
    console.log(`  - Fruits analyzed: ${fruitsAnalyzed}`);

    return {
      // Keep a summary block for structured consumption
      summary: {
        daysAnalyzed: uniqueDates.length,
        analyzedDates: uniqueDates,
        totalComparisons: totalComparisons,
        overallAccuracy: overallAccuracy,
        fruitsAnalyzed,
        analysisDate: todayISO,
        dateRange: {
          from: sevenDaysAgoISO,
          to: todayISO,
        },
      },
      // Also expose top-level fields for backward compatibility with frontend expectations
      daysAnalyzed: uniqueDates.length,
      overallAccuracy,
      totalComparisons,
      fruitsAnalyzed,
      dateRange: {
        from: sevenDaysAgoISO,
        to: todayISO,
      },
      perFruitAccuracy: perFruitAccuracy,
      perFruitAccuracyList,
      individualAccuracies: perFruitAccuracyList.map(item => ({
        name: item.fruit_name || item.fruitName,
        fruitId: item.fruit_id,
        accuracy: item.accuracy,
        accuracyPercent: item.accuracyPercent,
        averagePercentError: item.averagePercentError,
        comparisons: item.comparisons,
      })),
      detailedComparisons: accuracyData,
    };
  } catch (err) {
    console.error("[Accuracy Insights] Error:", err.message);
    throw err;
  }
}

/**
 * Get detailed accuracy for a specific fruit
 * @param {string} fruitNameParam - Fruit name to analyze
 * @returns {object} - Detailed accuracy metrics for the fruit
 */
async function getFruitAccuracyDetails(fruitNameParam) {
  try {
    const today = new Date();
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const todayISO = today.toISOString().split("T")[0];
    const sevenDaysAgoISO = sevenDaysAgo.toISOString().split("T")[0];

    // Get fruit details by name
    const { data: fruit, error: fruitErr } = await supabase
      .from("fruits")
      .select("id, name, variety")
      .ilike("name", `%${fruitNameParam}%`)
      .limit(1);

    if (fruitErr) throw fruitErr;
    if (!fruit || fruit.length === 0) {
      throw new Error(`Fruit "${fruitNameParam}" not found`);
    }

    // Get historical prices
    const { data: historicalPrices, error: histErr } = await supabase
      .from("historical_market_prices")
      .select("id, fruit_id, fruit_name, min_price, max_price, captured_at, economic_center")
      .eq("fruit_id", fruit[0].id)
      .gte("captured_at", sevenDaysAgoISO)
      .lte("captured_at", todayISO)
      .order("captured_at", { ascending: false });

    if (histErr) throw histErr;

    const uniqueDates = [...new Set(historicalPrices?.map(p => p.captured_at.split("T")[0]) || [])];

    // Get forecasts for same dates
    const { data: forecasts, error: forecastErr } = await supabase
      .from("forecasts")
      .select("fruit, date, forecast_value, target")
      .ilike("fruit", `%${fruit[0].name}%`)
      .in("date", uniqueDates)
      .eq("target", "price");

    if (forecastErr) throw forecastErr;

    // Calculate metrics
    const comparisons = [];
    let totalError = 0;
    let validComparisons = 0;

    for (const historical of historicalPrices || []) {
      const forecast = forecasts?.find(f => 
        f.fruit?.toLowerCase().includes(historical.fruit_name.toLowerCase()) && 
        f.date === historical.captured_at.split("T")[0]
      );
      const actual = (historical.min_price + historical.max_price) / 2;

      if (forecast) {
        const error = Math.abs(forecast.forecast_value - actual) / actual * 100;
        totalError += error;
        validComparisons++;

        comparisons.push({
          date: historical.captured_at.split("T")[0],
          actual: Math.round(actual * 100) / 100,
          predicted: Math.round(forecast.forecast_value * 100) / 100,
          error: Math.round(error * 100) / 100,
          accuracy: Math.round((100 - error) * 100) / 100,
        });
      }
    }

    const avgAccuracy = validComparisons > 0 
      ? Math.round((100 - (totalError / validComparisons)) * 100) / 100
      : null;

    return {
      fruit: fruit[0],
      analysisMetrics: {
        daysAnalyzed: uniqueDates.length,
        comparisonsWithForecasts: validComparisons,
        totalHistoricalRecords: historicalPrices?.length || 0,
        averageAccuracy: avgAccuracy,
        averagePercentError: validComparisons > 0 
          ? Math.round((totalError / validComparisons) * 100) / 100 
          : null,
      },
      comparisons: comparisons,
    };
  } catch (err) {
    console.error(`[Accuracy Insights] Fruit accuracy error:`, err.message);
    throw err;
  }
}

module.exports = {
  calculateAccuracyInsights,
  getFruitAccuracyDetails,
};
