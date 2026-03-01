-- Update orders table to support payment tracking during transport
-- This table is ONLY for transport job assignment and driver tracking
-- The placed_orders table is the single source of truth for order status
-- Run this in Supabase SQL Editor

-- Add reference to placed_orders (single source of truth)
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS placed_order_id UUID REFERENCES placed_orders(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS payment_id UUID REFERENCES payments(id) ON DELETE SET NULL;

-- Drop existing status constraint
ALTER TABLE orders
DROP CONSTRAINT IF EXISTS orders_status_check;

-- Simplified status constraint - ONLY transport job statuses
ALTER TABLE orders
ADD CONSTRAINT orders_status_check
CHECK (status = ANY (ARRAY[
    'pending'::text,      -- Waiting for driver assignment
    'assigned'::text,     -- Driver assigned, awaiting pickup
    'completed'::text     -- Transport job completed (driver delivered)
]));

-- Add comments
COMMENT ON COLUMN orders.placed_order_id IS 'Reference to the main order in placed_orders table (single source of truth)';
COMMENT ON COLUMN orders.payment_id IS 'Reference to payment record';
COMMENT ON TABLE orders IS 'Transport job assignments - tracks ONLY driver assignment and transport completion. Check placed_orders table for full order lifecycle.';
COMMENT ON COLUMN orders.status IS 'Transport job status only: pending (no driver), assigned (driver assigned), completed (delivered by driver). For order status, check placed_orders.status';
