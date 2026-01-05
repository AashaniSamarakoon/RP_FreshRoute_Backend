// index.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cron = require("node-cron");

const { authMiddleware, requireRole } = require("./Services/auth");
const {
  runBatchMatching,
  markExpiredOrders,
} = require("./Services/matchingService");
const authRoutes = require("./routes/Auth/authRoutes");
const transporterRoutes = require("./routes/transporter/transporterRoutes");
const fruitsRoutes = require("./routes/common/fruitsRoutes");
const predictStockRoutes = require("./routes/farmer/predictStockRoutes");
const orderRoutes = require("./routes/buyer/orderRoutes");
const farmerDashboardRoutes = require("./routes/farmer/dashboardRoutes");
const transporterDashboardRoutes = require("./routes/transporter/dashboardRoutes");
const buyerDashboardRoutes = require("./routes/buyer/dashboardRoutes");
const farmerProposalRoutes = require("./routes/farmer/proposalRoutes");
const trustRoutes = require("./routes/common/trustRoutes");
const fruitGradingRoutes = require("./routes/common/fruitGradingRoutes");
const fruitGradingService = require("./Services/fruitGrading/fruitGradingService");
const multer = require("multer");
const logisticsRoutes = require("./routes/transporter/logisticsRoutes");
const telemetryRoutes = require("./routes/transporter/telemetryRoutes");
const gradingRoutes = require("./routes/transporter/gradingRoutes");

const app = express();
app.use(cors());
app.use(express.json());

// Routes
app.use(
  "/api/transporter",
  authMiddleware,
  requireRole("transporter"),
  transporterRoutes
);

// Grading routes (transporter role required)
app.use(
  "/api/gradings",
  authMiddleware,
  requireRole("transporter"),
  gradingRoutes
);

// Fruit properties (GET id, fruit_name, variant)
app.use("/api/fruit-properties", authMiddleware, fruitsRoutes);

// Farmer predict stock submission
app.use(
  "/api/farmer/add-predict-stock",
  authMiddleware,
  requireRole("farmer"),
  predictStockRoutes
);

// Farmer proposals (view/accept/reject buyer requests)
app.use("/api/farmer/proposals", farmerProposalRoutes);

// Buyer place order
app.use(
  "/api/buyer/place-order",
  authMiddleware,
  requireRole("buyer"),
  orderRoutes
);

// Auth routes
app.use("/api/auth", authRoutes);
app.use("/api/trust", trustRoutes);

// Fruit Grading Routes (buyer or transporter role required)
app.use(
  "/api/fruit-grading",
  authMiddleware,
  requireRole("buyer", "transporter"),
  fruitGradingRoutes
);

// Dashboard routes
app.use("/api/farmer/dashboard", farmerDashboardRoutes);
app.use("/api/transporter/dashboard", transporterDashboardRoutes);
app.use("/api/buyer/dashboard", buyerDashboardRoutes);

// Error handler for multer errors (must be after all routes)
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        success: false,
        message: "File too large. Maximum size is 10MB per file.",
      });
    }
    if (error.code === "LIMIT_FILE_COUNT") {
      return res.status(400).json({
        success: false,
        message: "Too many files. Maximum 5 files allowed.",
      });
    }
    if (error.code === "LIMIT_FIELD_SIZE") {
      return res.status(400).json({
        success: false,
        message: "Field too large. Maximum size is 50MB per field.",
      });
    }
    return res.status(400).json({ 
      success: false,
      message: error.message 
    });
  }
  if (error) {
    return res.status(400).json({ 
      success: false,
      message: error.message 
    });
  }
  next();
});

app.use(
  "/api/logistics",
  // authMiddleware,
  // requireRole("transporter"),
  logisticsRoutes
);

app.use(
  "/api/telemetry",
  // authMiddleware,
  // requireRole("transporter"),
  telemetryRoutes
);

// ---------- START SERVER ----------
const port = process.env.PORT || 4000;

// Load ONNX model on startup
async function startServer() {
  try {
    console.log("Loading fruit grading model...");
    await fruitGradingService.loadModel();
    console.log("✅ Fruit grading model loaded successfully");
  } catch (error) {
    console.error("⚠️  Warning: Failed to load fruit grading model:", error.message);
    console.error("   Fruit grading endpoints will not be available.");
  }

  app.listen(port, "0.0.0.0", () => {
    console.log(`FreshRoute backend running on port ${port}`);
  });
}

startServer();

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
  "[Cron] Scheduled jobs initialized: Batch matching (every 2h), Expiry check (daily)"
);
