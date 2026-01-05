// index.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cron = require("node-cron");
const bcrypt = require("bcryptjs");

const { supabase } = require("./utils/supabaseClient");
const { authMiddleware, requireRole, generateToken } = require("./Services/auth");
const {
  runBatchMatching,
  markExpiredOrders,
} = require("./Services/matchingService");
const { startSMSScheduler } = require("./Services/farmer/smsScheduler");
const { startDambullaScheduler } = require("./Services/farmer/dambullaScheduler");
const { initializeTodaysPrices, updateFreshRoutePrices } = require("./Services/farmer/freshRoutePriceUpdater");
const { getFreshRoutePrices } = require("./routes/farmer/freshRoutePricesEndpoint");
const authRoutes = require("./routes/Auth/authRoutes");
const transporterRoutes = require("./routes/transporter/transporterRoutes");
const fruitsRoutes = require("./routes/common/fruitsRoutes");
const predictStockRoutes = require("./routes/farmer/predictStockRoutes");
const orderRoutes = require("./routes/buyer/orderRoutes");
const farmerDashboardRoutes = require("./routes/farmer/dashboardRoutes");
const transporterDashboardRoutes = require("./routes/transporter/dashboardRoutes");
const buyerDashboardRoutes = require("./routes/buyer/dashboardRoutes");
const farmerProposalRoutes = require("./routes/farmer/proposalRoutes");
const farmerRoutes = require("./routes/farmer");
const trustRoutes = require("./routes/common/trustRoutes");
const app = express();
app.use(cors());
app.use(express.json());

// Add detailed request logging middleware
app.use((req, res, next) => {
  const startTime = Date.now();
  const originalJson = res.json;
  res.json = function(data) {
    const duration = Date.now() - startTime;
    const isError = res.statusCode >= 400;
    const icon = isError ? '❌' : '✅';
    console.log(`${icon} [${new Date().toISOString()}] ${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
    if (isError || req.path.includes('forecast')) {
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
// Frontend calls /forecast/7day instead of /api/farmer/forecast/7day
app.use((req, res, next) => {
  // Check if this looks like a farmer API call but missing /api/farmer prefix
  const forecastRoutes = ['/forecast', '/forecast/7day', '/forecast/fruit', '/live-market', '/prices', '/notifications', '/dashboard', '/home', '/accuracy'];
  const isFarmerRoute = forecastRoutes.some(route => req.path.startsWith(route));
  
  if (isFarmerRoute && !req.path.startsWith('/api/')) {
    // Redirect the request to /api/farmer + path
    req.url = `/api/farmer${req.url}`;
    req.path = `/api/farmer${req.path}`;
  }
  next();
});

// Routes
app.use(
  "/api/transporter",
  authMiddleware,
  requireRole("transporter"),
  transporterRoutes
);

// Farmer routes (forecast, notifications, SMS, etc.)
app.use(
  "/api/farmer",
  authMiddleware,
  requireRole("farmer"),
  farmerRoutes
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

// Buyer FreshRoute prices (same payload as farmer)
app.get(
  "/api/buyer/prices/freshroute",
  authMiddleware,
  requireRole("buyer"),
  getFreshRoutePrices
);

// Auth routes
app.use("/api/auth", authRoutes);
app.use("/api/trust", trustRoutes);

// Dashboard routes
app.use("/api/farmer/dashboard", farmerDashboardRoutes);
app.use("/api/transporter/dashboard", transporterDashboardRoutes);
app.use("/api/buyer/dashboard", buyerDashboardRoutes);

// ---------- AUTH INLINE (legacy supabase signup/login) ----------
app.post("/api/auth/signup", async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({ message: "Missing fields" });
    }

    const allowedRoles = ["farmer", "transporter", "buyer", "admin"];
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }

    const { data: existingUsers, error: existingError } = await supabase
      .from("users")
      .select("id")
      .eq("email", email);

    if (existingError) {
      console.error("Supabase select error:", existingError);
      return res.status(500).json({ message: "Database error" });
    }

    if (existingUsers && existingUsers.length > 0) {
      return res.status(409).json({ message: "Email already registered" });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const { data: insertedUsers, error: insertError } = await supabase
      .from("users")
      .insert({ name, email, password_hash: passwordHash, role })
      .select("id, name, email, role");

    if (insertError) {
      console.error("Supabase insert error:", insertError);
      return res.status(500).json({ message: "Failed to create user" });
    }

    const user = insertedUsers[0];
    const token = generateToken(user);
    res.status(201).json({ token, user });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Missing email or password" });
    }

    const { data: users, error } = await supabase
      .from("users")
      .select("id, name, email, role, password_hash")
      .eq("email", email)
      .limit(1);

    if (error) {
      console.error("Supabase select error:", error);
      return res.status(500).json({ message: "Database error" });
    }

    const user = users && users[0];
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = generateToken(user);

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

app.get("/api/auth/me", authMiddleware, async (req, res) => {
  try {
    const { data: users, error } = await supabase
      .from("users")
      .select("id, name, email, role")
      .eq("id", req.user.id)
      .limit(1);

    if (error) {
      console.error("Supabase select error:", error);
      return res.status(500).json({ message: "Database error" });
    }

    const user = users && users[0];
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({ user });
  } catch (err) {
    console.error("Me error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// 404 handler - returns JSON instead of HTML
app.use((req, res) => {
  res.status(404).json({ message: `Route ${req.method} ${req.path} not found` });
});

// Error handler middleware - ensures all errors return JSON
app.use((err, req, res, next) => {
  console.error('Global error handler:', err);
  res.status(err.status || 500).json({
    message: err.message || 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

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
  "[Cron] Scheduled jobs initialized: Batch matching (every 2h), Expiry check (daily)"
);

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
