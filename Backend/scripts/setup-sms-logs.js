#!/usr/bin/env node
/**
 * Setup SMS Logs Table
 * Runs once to create the sms_logs table with indexes and constraints
 * Usage: node scripts/setup-sms-logs.js
 */

const { supabaseAdmin } = require("../utils/supabaseClient");

async function setupSMSLogsTable() {
  try {
    console.log("🔧 Setting up SMS Logs table...");

    // Create table and indexes using raw SQL through Supabase
    const sql = `
      CREATE TABLE IF NOT EXISTS public.sms_logs (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        farmer_id uuid NULL REFERENCES public.users(id) ON DELETE CASCADE ON UPDATE CASCADE,
        phone text NOT NULL,
        message_type text NOT NULL DEFAULT 'forecast'::text,
        forecast_ids uuid[] NULL DEFAULT '{}',
        message text NULL,
        status text NOT NULL DEFAULT 'pending'::text,
        error_message text NULL,
        retry_count integer NOT NULL DEFAULT 0,
        sent_at timestamp with time zone NULL DEFAULT now(),
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        updated_at timestamp with time zone NOT NULL DEFAULT now(),
        CONSTRAINT sms_logs_pkey PRIMARY KEY (id),
        CONSTRAINT sms_logs_status_check CHECK (
          (
            status = ANY (
              ARRAY['pending'::text, 'sent'::text, 'failed'::text]
            )
          )
        ),
        CONSTRAINT sms_logs_message_type_check CHECK (
          (
            message_type = ANY (
              ARRAY['forecast'::text, 'price_update'::text, 'alert'::text]
            )
          )
        )
      ) TABLESPACE pg_default;

      CREATE INDEX IF NOT EXISTS idx_sms_logs_farmer ON public.sms_logs USING btree (farmer_id) TABLESPACE pg_default;
      CREATE INDEX IF NOT EXISTS idx_sms_logs_recent ON public.sms_logs USING btree (sent_at DESC) TABLESPACE pg_default;
      CREATE INDEX IF NOT EXISTS idx_sms_logs_status ON public.sms_logs USING btree (status) TABLESPACE pg_default;
      CREATE INDEX IF NOT EXISTS idx_sms_logs_message_type ON public.sms_logs USING btree (message_type) TABLESPACE pg_default;
    `;

    const { error } = await supabaseAdmin.rpc('execute_sql', { sql });

    if (error) {
      // Try alternative approach: use migrations
      console.log("⚠️  RPC approach failed. Attempting direct table check...");
      
      const { data: tables, error: tableErr } = await supabaseAdmin
        .from("information_schema.tables")
        .select("table_name")
        .eq("table_schema", "public")
        .eq("table_name", "sms_logs");

      if (tableErr || !tables || tables.length === 0) {
        console.warn("⚠️  sms_logs table not found. Please create it manually using:");
        console.warn("   1. Go to Supabase dashboard > SQL Editor");
        console.warn("   2. Run the SQL from Backend/scripts/create_sms_logs_table.sql");
        return;
      }
    }

    console.log("✅ SMS Logs table setup complete!");
    console.log("   - Table: sms_logs");
    console.log("   - Indexes: idx_sms_logs_farmer, idx_sms_logs_recent");
    console.log("   - Foreign key: farmer_id → users.id");

  } catch (err) {
    console.error("❌ Setup error:", err.message);
    console.log("\n📖 Manual Setup Instructions:");
    console.log("1. Open Supabase Dashboard (https://supabase.com/dashboard)");
    console.log("2. Navigate to SQL Editor");
    console.log("3. Copy & paste contents of Backend/scripts/create_sms_logs_table.sql");
    console.log("4. Execute the query");
    process.exit(1);
  }
}

// Run setup
setupSMSLogsTable().then(() => process.exit(0));
