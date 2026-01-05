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

// Dashboard routes
app.use("/api/farmer/dashboard", farmerDashboardRoutes);
app.use("/api/transporter/dashboard", transporterDashboardRoutes);
app.use("/api/buyer/dashboard", buyerDashboardRoutes);

// ---------- START SERVER ----------
const port = process.env.PORT || 4000;
app.listen(port, "0.0.0.0", () => {
  console.log(`FreshRoute backend running on port ${port}`);
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
  "[Cron] Scheduled jobs initialized: Batch matching (every 2h), Expiry check (daily)"
);
