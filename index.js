// index.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");

const { supabase } = require("./supabaseClient");
const { generateToken, authMiddleware, requireRole } = require("./auth");
const transporterRoutes = require("./routes/transporterRoutes");
const fruitGradingRoutes = require("./routes/fruitGradingRoutes");
const fruitGradingService = require("./services/fruitGradingService");
const multer = require("multer");

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

// Fruit Grading Routes (no auth required for now, add if needed)
app.use("/api/fruit-grading", fruitGradingRoutes);

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

// Error handler for multer errors (must be after all routes)
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        message: "File too large. Maximum size is 10MB per file.",
      });
    }
    if (error.code === "LIMIT_FILE_COUNT") {
      return res.status(400).json({
        message: "Too many files. Maximum 5 files allowed.",
      });
    }
    return res.status(400).json({ message: error.message });
  }
  if (error) {
    return res.status(400).json({ message: error.message });
  }
  next();
});

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

  app.listen(port, () => {
    console.log(`FreshRoute backend running on port ${port}`);
  });
}

startServer();
