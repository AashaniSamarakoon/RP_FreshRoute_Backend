// auth.js
// using Supabase for authentication, we no longer sign our own JWTs
// keep generateToken around only if some legacy code or blockchain needs it
const jwt = require("jsonwebtoken");
const { supabase, supabaseAdmin } = require("../utils/supabaseClient");

function generateToken(user) {
  const secret = process.env.JWT_SECRET;
  if (!user || !secret) return null;
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    secret,
    { expiresIn: "7d" },
  );
}

async function resolveRoleFromUsersTable({ id, email }) {
  try {
    let query = supabaseAdmin.from("users").select("role").limit(1);
    if (id) query = query.eq("id", id);
    else if (email) query = query.eq("email", email);
    else return "";

    const { data, error } = await query.single();
    if (error || !data?.role) return "";
    return String(data.role).toLowerCase();
  } catch {
    return "";
  }
}

async function fetchUserDetailsFromDatabase({ id, email }) {
  try {
    let query = supabaseAdmin.from("users").select("first_name,last_name,phone,role").limit(1);
    if (id) query = query.eq("id", id);
    else if (email) query = query.eq("email", email);
    else return {};

    const { data, error } = await query.single();
    if (error || !data) return {};
    return data;
  } catch {
    return {};
  }
}

async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Missing token" });
  }
  const token = authHeader.split(" ")[1];

  // verify via Supabase (primary auth)
  const { data, error } = await supabase.auth.getUser(token);
  if (!error && data?.user) {
    const u = data.user;
    req.user = {
      id: u.id,
      email: u.email,
      role: String(u.user_metadata?.role || u.app_metadata?.role || "").toLowerCase(),
      first_name: u.user_metadata?.first_name,
      last_name: u.user_metadata?.last_name,
      phone: u.phone,
    };

    if (!req.user.role) {
      req.user.role = await resolveRoleFromUsersTable({
        id: req.user.id,
        email: req.user.email,
      });
    }

    // Fetch missing name fields from database
    if (!req.user.first_name || !req.user.last_name) {
      const dbDetails = await fetchUserDetailsFromDatabase({
        id: req.user.id,
        email: req.user.email,
      });
      req.user.first_name = req.user.first_name || dbDetails.first_name;
      req.user.last_name = req.user.last_name || dbDetails.last_name;
      req.user.phone = req.user.phone || dbDetails.phone;
    }

    return next();
  }

  // optional legacy JWT fallback (only if a server secret is configured)
  const legacySecret = process.env.JWT_SECRET;
  if (!legacySecret) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }

  try {
    const payload = jwt.verify(token, legacySecret);
    req.user = {
      id: payload.id || payload.sub,
      email: payload.email,
      role: String(payload.role || "").toLowerCase(),
      first_name: payload.first_name,
      last_name: payload.last_name,
      phone: payload.phone,
    };

    if (!req.user.role) {
      req.user.role = await resolveRoleFromUsersTable({
        id: req.user.id,
        email: req.user.email,
      });
    }

    // Fetch missing name fields from database
    if (!req.user.first_name || !req.user.last_name) {
      const dbDetails = await fetchUserDetailsFromDatabase({
        id: req.user.id,
        email: req.user.email,
      });
      req.user.first_name = req.user.first_name || dbDetails.first_name;
      req.user.last_name = req.user.last_name || dbDetails.last_name;
      req.user.phone = req.user.phone || dbDetails.phone;
    }

    return next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: "Forbidden: insufficient role" });
    }
    next();
  };
}

module.exports = { generateToken, authMiddleware, requireRole };
