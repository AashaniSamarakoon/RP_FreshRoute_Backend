// index.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");

const { supabase } = require("./supabaseClient");
const { generateToken, authMiddleware, requireRole } = require("./auth");
const transporterRoutes = require("./routes/transporterRoutes");
const farmerRoutes = require("./routes/farmer");
const adminRoutes = require("./routes/admin");
const fruitsRoutes = require("./routes/fruitsRoutes");
const predictStockRoutes = require("./routes/predictStockRoutes");

const orderRoutes = require("./routes/orderRoutes");
const { startSMSScheduler } = require("./services/farmer/smsScheduler");
const { startDambullaScheduler } = require("./services/farmer/dambullaScheduler");

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

app.use("/api/farmer", authMiddleware, requireRole("farmer"), farmerRoutes);
app.use("/api/admin", authMiddleware, requireRole("admin"), adminRoutes);
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

// ---------- AUTH ROUTES ----------

// Signup
app.post("/api/auth/signup", async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({ message: "Missing fields" });
    }

    const allowedRoles = ["farmer", "transporter", "buyer"];
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }

    // 1. Check if email exists
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

    // 2. Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // 3. Insert user
    const { data: insertedUsers, error: insertError } = await supabase
      .from("users")
      .insert({
        name,
        email,
        password_hash: passwordHash,
        role,
      })
      .select("id, name, email, role");

    if (insertError) {
      console.error("Supabase insert error:", insertError);
      return res.status(500).json({ message: "Failed to create user" });
    }

    const user = insertedUsers[0];

    // 4. Create role-specific entry
    if (role === "farmer") {
      const { error: farmerError } = await supabase
        .from("farmer")
        .insert({ user_id: user.id });

      if (farmerError) {
        console.error("Failed to create farmer entry:", farmerError);
        // Clean up user if farmer creation fails
        await supabase.from("users").delete().eq("id", user.id);
        return res
          .status(500)
          .json({ message: "Failed to create farmer user" });
      }
    } else if (role === "buyer") {
      const { error: buyerError } = await supabase
        .from("buyers")
        .insert({ user_id: user.id });

      if (buyerError) {
        console.error("Failed to create buyer entry:", buyerError);
        // Clean up user if buyer creation fails
        await supabase.from("users").delete().eq("id", user.id);
        return res
          .status(500)
          .json({ message: "Failed to create buyer user" });
      }
    } else if (role === "transporter") {
      const { error: transporterError } = await supabase
        .from("transporter")
        .insert({ user_id: user.id });

      if (transporterError) {
        console.error("Failed to create transporter entry:", transporterError);
        // Clean up user if transporter creation fails
        await supabase.from("users").delete().eq("id", user.id);
        return res
          .status(500)
          .json({ message: "Failed to create transporter user" });
      }
    }

    const token = generateToken(user);

    res.status(201).json({ token, user });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Login
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

// Get current user
app.get(
  "/api/auth/me",
  authMiddleware,
  requireRole("transporter"),
  async (req, res) => {
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
  }
);

// ---------- DASHBOARD ROUTES ----------

// Farmer dashboard
app.get(
  "/api/farmer/dashboard",
  authMiddleware,
  requireRole("farmer"),
  async (req, res) => {
    // TODO: replace with real farmer data later
    res.json({
      message: `Welcome, farmer ${req.user.name}`,
      upcomingPickups: [],
      stats: {
        totalShipments: 0,
        spoilageReduced: 0,
      },
    });
  }
);

// Transporter dashboard
app.get(
  "/api/transporter/dashboard",
  authMiddleware,
  requireRole("transporter"),
  async (req, res) => {
    res.json({
      message: `Welcome, transporter ${req.user.name}`,
      todayJobs: [],
      vehicleStatus: [],
    });
  }
);

// Buyer dashboard
app.get(
  "/api/buyer/dashboard",
  authMiddleware,
  requireRole("buyer"),
  async (req, res) => {
    res.json({
      message: `Welcome, buyer ${req.user.name}`,
      openOrders: [],
      deliveriesInTransit: [],
    });
  }
);

// ---------- START SERVER ----------
const port = process.env.PORT || 4000;
// Bind to 0.0.0.0 to listen on all network interfaces (required for mobile access)
app.listen(port, "0.0.0.0", () => {
  console.log(`FreshRoute backend running on 0.0.0.0:${port}`);
  console.log(`Available at: http://192.168.43.45:${port}`);
  
  // Start SMS scheduler
  startSMSScheduler();
  
  // Start Dambulla price scraper
  startDambullaScheduler({ runOnStart: true });
  console.log("✓ All schedulers started");
});