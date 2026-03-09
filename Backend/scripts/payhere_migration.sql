-- =============================================================================
-- Migration: Switch from bank-slip / OCR payments to PayHere gateway
-- Run this once against your Supabase database (SQL editor or psql).
-- =============================================================================

-- 1. Add PayHere external payment reference to payments table
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS payhere_payment_id VARCHAR(100);

-- 2. Update default payment method to reflect the new gateway
ALTER TABLE payments
  ALTER COLUMN payment_method SET DEFAULT 'payhere';

-- 3. Drop slip-specific partial indexes (must precede column drops)
DROP INDEX IF EXISTS idx_payments_slip_verification_status;
DROP INDEX IF EXISTS idx_payments_slip_image_hash;

-- 4. Remove all bank-slip / OCR columns that are no longer needed
ALTER TABLE payments
  DROP COLUMN IF EXISTS payment_slip_url,
  DROP COLUMN IF EXISTS slip_uploaded_at,
  DROP COLUMN IF EXISTS slip_ocr_data,
  DROP COLUMN IF EXISTS slip_verification_status,
  DROP COLUMN IF EXISTS slip_verified_by,
  DROP COLUMN IF EXISTS slip_verified_at,
  DROP COLUMN IF EXISTS slip_verification_notes,
  DROP COLUMN IF EXISTS slip_image_hash,
  DROP COLUMN IF EXISTS upload_metadata;

-- =============================================================================
-- Trigger: auto-create an orders (transport-job) row when a placed_order
-- transitions to AUTHORIZED_PAYMENT.
--
-- Populated columns:
--   buyer_id        <- placed_orders.buyer_id
--   farmer_id       <- placed_orders.selected_farmer_id  (= farmers.user_id)
--   fruit_type      <- placed_orders.fruit_type
--   fruit_variant   <- placed_orders.variant
--   quantity        <- placed_orders.quantity
--   pickup_location <- farmers.location  (farmer's text address)
--   pickup_lat      <- farmers.latitude
--   pickup_lng      <- farmers.longitude
--   drop_location   <- placed_orders.delivery_location
--   drop_lat        <- placed_orders.latitude
--   drop_lng        <- placed_orders.longitude
--   placed_order_id <- placed_orders.id
--   status          <- 'pending'
-- =============================================================================

CREATE OR REPLACE FUNCTION create_transport_order_on_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only fire when transitioning INTO AUTHORIZED_PAYMENT and a farmer is assigned
  IF NEW.status = 'AUTHORIZED_PAYMENT'
     AND (OLD.status IS DISTINCT FROM 'AUTHORIZED_PAYMENT')
     AND NEW.selected_farmer_id IS NOT NULL
  THEN
    INSERT INTO orders (
      buyer_id,
      farmer_id,
      fruit_type,
      fruit_variant,
      quantity,
      pickup_location,
      pickup_lat,
      pickup_lng,
      drop_location,
      drop_lat,
      drop_lng,
      placed_order_id,
      status
    )
    SELECT
      NEW.buyer_id,
      f.user_id,
      NEW.fruit_type,
      NEW.variant,
      NEW.quantity,
      f.location,
      f.latitude,
      f.longitude,
      NEW.delivery_location,
      NEW.latitude,
      NEW.longitude,
      NEW.id,
      'pending'
    FROM farmers f
    WHERE f.user_id = NEW.selected_farmer_id;
  END IF;

  RETURN NEW;
END;
$$;

-- Attach trigger to placed_orders (recreate safely)
DROP TRIGGER IF EXISTS trg_create_transport_order ON placed_orders;

CREATE TRIGGER trg_create_transport_order
  AFTER UPDATE ON placed_orders
  FOR EACH ROW
  EXECUTE FUNCTION create_transport_order_on_payment();
