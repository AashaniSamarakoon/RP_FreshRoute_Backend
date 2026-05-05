// supabaseClient.js
require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");
const WebSocket = require("ws");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_KEY in .env");
}

const supabaseOptions = {
  realtime: {
    transport: WebSocket,
  },
};

// Regular client (uses anon key, requires RLS policies)
const supabase = createClient(supabaseUrl, supabaseKey, supabaseOptions);

// Admin client (uses service_role key, bypasses RLS)
// Use this for backend operations like file uploads, admin queries, etc.
const supabaseAdmin = supabaseServiceRoleKey
  ? createClient(supabaseUrl, supabaseServiceRoleKey, {
      ...supabaseOptions,
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : supabase; // Fallback to regular client if service key not provided

if (!supabaseServiceRoleKey) {
  console.warn(
    "⚠️  SUPABASE_SERVICE_ROLE_KEY not found. Using anon key for admin operations (not recommended for production).",
  );
}

module.exports = { supabase, supabaseAdmin };
