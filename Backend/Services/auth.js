// auth.js
// using Supabase for authentication, we no longer sign our own JWTs
// keep generateToken around only if some legacy code or blockchain needs it

function generateToken(user) {
  // still generate a token for non-Supabase use-cases (e.g. internal API)
  return user ? JSON.stringify({ id: user.id, role: user.role }) : null;
}

const { supabase } = require("../utils/supabaseClient");

async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Missing token" });
  }
  const token = authHeader.split(" ")[1];

  // verify via Supabase
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
  // user_metadata and email etc are available
  const u = data.user;
  req.user = {
    id: u.id,
    email: u.email,
    role: (u.user_metadata?.role || "").toLowerCase(),
    first_name: u.user_metadata?.first_name,
    last_name: u.user_metadata?.last_name,
    phone: u.phone,
  };
  next();
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
