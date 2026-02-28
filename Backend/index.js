// index.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cron = require("node-cron");
const bcrypt = require("bcryptjs");

const { supabase } = require("./utils/supabaseClient");
const {
  authMiddleware,
  requireRole,
  generateToken,
} = require("./Services/auth");
const {
  runBatchMatching,
  markExpiredOrders,
} = require("./Services/matchingService");
const {
  startSMSScheduler,
  triggerSMSNow,
} = require("./Services/farmer/smsScheduler");
const {
  startDambullaScheduler,
} = require("./Services/farmer/dambullaScheduler");
const {
  initializeTodaysPrices,
  updateFreshRoutePrices,
} = require("./Services/farmer/freshRoutePriceUpdater");
const { archiveOldPrices } = require("./Services/farmer/priceArchiver");
// pricing endpoint is handled by its own router
const freshRoutePricesRouter = require("./routes/common/freshRoutePricesEndpoint");
const {
  calculateAccuracyInsights,
} = require("./Services/farmer/accuracyInsights");
const authRoutes = require("./routes/Auth/authRoutes");
const transporterRoutes = require("./routes/transporter/transporterRoutes");
const fruitsRoutes = require("./routes/common/fruitsRoutes");
const forecastRouter = require("./routes/common/forecastRoutes");
const predictStockRoutes = require("./routes/farmer/predictStockRoutes");
const orderRoutes = require("./routes/buyer/orderRoutes");
const matchingRoutes = require("./routes/buyer/matchingRoutes");
const farmerDashboardRoutes = require("./routes/farmer/dashboardRoutes");
const transporterDashboardRoutes = require("./routes/transporter/dashboardRoutes");
const buyerDashboardRoutes = require("./routes/buyer/dashboardRoutes");
const farmerProposalRoutes = require("./routes/farmer/proposalRoutes");
const farmerRoutes = require("./routes/farmer");
const trustRoutes = require("./routes/common/trustRoutes");
const logisticsRoutes = require("./routes/transporter/logisticsRoutes");
const telemetryRoutes = require("./routes/transporter/telemetryRoutes");

const alertRoutes = require("./routes/alertRoutes");
const accuracyRoutes = require("./routes/farmer/accuracyRoutes");
const blockchainDashboardRoutes = require("./routes/dashboard/dashboardRoutes");
const paymentSlipRoutes = require("./routes/buyer/paymentSlipRoutes");
const paymentRoutes = require("./routes/buyer/paymentRoutes");
const deliveryRoutes = require("./routes/transporter/deliveryRoutes");
const app = express();
app.use(cors());
app.use(express.json());

// Add detailed request logging middleware
app.use((req, res, next) => {
  const startTime = Date.now();
  const originalJson = res.json;
  res.json = function (data) {
    const duration = Date.now() - startTime;
    const isError = res.statusCode >= 400;
    const icon = isError ? "❌" : "✅";
    console.log(
      `${icon} [${new Date().toISOString()}] ${req.method} ${req.path} - ${
        res.statusCode
      } (${duration}ms)`,
    );
    if (isError || req.path.includes("forecast")) {
      console.log(`   Data: ${JSON.stringify(data).substring(0, 100)}`);
    }
    return originalJson.call(this, data);
  };

  next();
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString(), port: 4000 });
});

// Middleware to redirect frontend API calls that use wrong paths
// Frontend sometimes omits the "/api" prefix; instead of assuming farmer we
// simply add "/api". The individual routers will then apply any required
// role checks (farmer/buyer) or, in the case of common endpoints, accept
// any authenticated user.
app.use((req, res, next) => {
  const prefixable = [
    "/forecast",
    "/forecast/7day",
    "/forecast/fruit",
    "/live-market",
    "/prices",
    "/notifications",
    "/dashboard",
    "/home",
    "/accuracy",
  ];
  const missingApi = !req.path.startsWith("/api/");
  const matches = prefixable.some((route) => req.path.startsWith(route));
  if (matches && missingApi) {
    req.url = `/api${req.url}`;
    req.path = `/api${req.path}`;
  }
  next();
});

// Routes
app.use(
  "/api/transporter",
  authMiddleware,
  requireRole("transporter"),
  transporterRoutes,
);

// Farmer routes (forecast, notifications, SMS, etc.)
app.use("/api/farmer", authMiddleware, requireRole("farmer"), farmerRoutes);

// Fruit properties (GET id, fruit_name, variant)
// public endpoint – the frontend needs fruit list even before login
app.use("/api/fruit-properties", fruitsRoutes);

// Farmer predict stock submission
app.use(
  "/api/farmer/add-predict-stock",
  authMiddleware,
  requireRole("farmer"),
  predictStockRoutes,
);

// Farmer proposals (view/accept/reject buyer requests)
app.use("/api/farmer/proposals", farmerProposalRoutes);

// Buyer place order
app.use(
  "/api/buyer/place-order",
  authMiddleware,
  requireRole("buyer"),
  orderRoutes,
);

// Buyer matching (view/trigger proposals from matching algorithm)
app.use("/api/buyer/matching", matchingRoutes);

// FreshRoute prices are a common endpoint accessible by any authenticated user
app.use("/api/prices/freshroute", authMiddleware, freshRoutePricesRouter);

// shared forecast endpoint (allows any authenticated user) mounted at fixed path
app.use("/api/forecast", authMiddleware, forecastRouter);

// Auth routes
app.use("/api/auth", authRoutes);
app.use("/api/trust", trustRoutes);

// Alert routes (for notifications and SMS)
app.use("/api/alerts", alertRoutes);

// Payment slip routes (Bank slip upload & verification - Fully Automated)
app.use("/api/buyer/payment-slip", paymentSlipRoutes);

// Payment status and release routes
app.use("/api/buyer/payment", paymentRoutes);

// Transporter delivery routes (quality check, pickup, delivery confirmation)
app.use("/api/transporter/delivery", deliveryRoutes);

// Accuracy insights routes (forecast accuracy analysis)
app.use(
  "/api/farmer/accuracy",
  authMiddleware,
  requireRole("farmer"),
  accuracyRoutes,
);

// Dashboard routes
app.use("/api/farmer/dashboard", farmerDashboardRoutes);
app.use("/api/transporter/dashboard", transporterDashboardRoutes);
app.use("/api/buyer/dashboard", buyerDashboardRoutes);

// Blockchain Dashboard routes (NEW - business-first, role-based)
app.use("/api/dashboard", authMiddleware, blockchainDashboardRoutes);

app.use(
  "/api/logistics",
  // authMiddleware,
  // requireRole("transporter"),
  logisticsRoutes,
);

app.use(
  "/api/telemetry",
  // authMiddleware,
  // requireRole("transporter"),
  telemetryRoutes,
);

// ---------- START SERVER ----------
const port = process.env.PORT || 4000;
const server = app.listen(port, "0.0.0.0", () => {
  console.log(`FreshRoute backend running on port ${port}`);
  console.log(`Available at: http://0.0.0.0:${port}`);

  // Start SMS scheduler and Dambulla scraper
  try {
    startSMSScheduler();
    console.log("✓ SMS scheduler started");
  } catch (smsErr) {
    console.error("SMS Scheduler error:", smsErr.message);
  }

  try {
    startDambullaScheduler({ runOnStart: true });
    console.log("✓ Dambulla scheduler started");
  } catch (dambullaErr) {
    console.error("Dambulla Scheduler error:", dambullaErr.message);
  }

  console.log("✓ All schedulers started");
});

server.on("error", (err) => {
  console.error("Server listening error:", err);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
  process.exit(1);
});

// ---------- SCHEDULED JOBS ----------
// Run batch matching every 2 hours (at minute 0)
cron.schedule("0 */2 * * *", async () => {
  console.log("[Cron] Running scheduled batch matching...");
  await runBatchMatching();
});

// Mark expired orders daily at midnight
cron.schedule("0 0 * * *", async () => {
  console.log("[Cron] Checking for expired orders...");
  await markExpiredOrders();
});

console.log(
  "[Cron] Scheduled jobs initialized: Batch matching (every 2h), Expiry check (daily)",
);

// Archive previous-day market prices on startup
(async () => {
  try {
    console.log("[Init] Archiving previous-day market prices...");
    const result = await archiveOldPrices();
    console.log("[Init] Price archive result:", result);
  } catch (err) {
    console.warn("[Init] Warning archiving prices:", err.message);
  }
})();

// Initialize today's FreshRoute prices on startup
(async () => {
  try {
    console.log("[Init] Initializing FreshRoute prices...");
    const result = await initializeTodaysPrices();
    console.log("[Init] FreshRoute prices initialized:", result);
  } catch (err) {
    console.warn("[Init] Warning initializing prices:", err.message);
  }
})();

// Calculate accuracy insights on startup
(async () => {
  try {
    console.log("[Init] Calculating accuracy insights...");
    const insights = await calculateAccuracyInsights();
    console.log("[Init] Accuracy insights calculated:", {
      overallAccuracy: insights.summary.overallAccuracy,
      comparisons: insights.summary.totalComparisons,
      fruitsAnalyzed: insights.summary.fruitsAnalyzed,
    });
  } catch (err) {
    console.warn("[Init] Warning calculating accuracy insights:", err.message);
  }
})();

// Send daily forecast SMS on startup if not sent today
(async () => {
  try {
    console.log("[Init] Checking if daily forecast SMS needs to be sent...");
    await triggerSMSNow();
  } catch (err) {
    console.warn("[Init] Warning triggering daily forecast SMS:", err.message);
  }
})();

// Update FreshRoute prices daily at 6:00 AM
cron.schedule("0 6 * * *", async () => {
  console.log("[Cron] Running daily FreshRoute price update...");
  try {
    const result = await updateFreshRoutePrices();
    console.log("[Cron] FreshRoute price update completed:", result);
  } catch (err) {
    console.error("[Cron] FreshRoute price update failed:", err.message);
  }
});
