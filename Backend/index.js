// index.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");

const { authMiddleware, requireRole } = require("./Services/auth");
const authRoutes = require("./routes/Auth/authRoutes");
const transporterRoutes = require("./routes/transporter/transporterRoutes");
const fruitsRoutes = require("./routes/shared/fruitsRoutes");
const predictStockRoutes = require("./routes/farmer/predictStockRoutes");
const orderRoutes = require("./routes/buyer/orderRoutes");
const farmerDashboardRoutes = require("./routes/farmer/dashboardRoutes");
const transporterDashboardRoutes = require("./routes/transporter/dashboardRoutes");
const buyerDashboardRoutes = require("./routes/buyer/dashboardRoutes");

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

// Buyer place order
app.use(
  "/api/buyer/place-order",
  authMiddleware,
  requireRole("buyer"),
  orderRoutes
);

// Auth routes
app.use("/api/auth", authRoutes);

// Dashboard routes
app.use("/api/farmer/dashboard", farmerDashboardRoutes);
app.use("/api/transporter/dashboard", transporterDashboardRoutes);
app.use("/api/buyer/dashboard", buyerDashboardRoutes);

// ---------- START SERVER ----------
const port = process.env.PORT || 4000;
app.listen(port, "0.0.0.0", () => {
  console.log(`FreshRoute backend running on port ${port}`);
});
