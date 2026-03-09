-- Public Transparency Portal — Database Migration
-- Run this in the Supabase SQL editor before deploying the portal.
-- All columns are nullable; existing rows are unaffected.

-- Price breakdown columns (persisted when farmer accepts a proposal)
ALTER TABLE placed_orders ADD COLUMN IF NOT EXISTS farmer_share_amount    NUMERIC(10,2);
ALTER TABLE placed_orders ADD COLUMN IF NOT EXISTS transporter_fee_amount NUMERIC(10,2);
ALTER TABLE placed_orders ADD COLUMN IF NOT EXISTS platform_fee_amount    NUMERIC(10,2);

-- QR / public portal columns (written at quality-confirmed pickup)
ALTER TABLE placed_orders ADD COLUMN IF NOT EXISTS public_verify_url      TEXT;
ALTER TABLE placed_orders ADD COLUMN IF NOT EXISTS qr_generated_at        TIMESTAMPTZ;

-- Farmer public display info (populated via farmer profile or manually)
ALTER TABLE farmers        ADD COLUMN IF NOT EXISTS farm_name             TEXT;
ALTER TABLE farmers        ADD COLUMN IF NOT EXISTS display_bio           TEXT;
