-- Update placed_orders table to support payment flow
-- Run this in Supabase SQL Editor

-- Drop existing status constraint
ALTER TABLE placed_orders
DROP CONSTRAINT IF EXISTS placed_orders_status_check;

-- Add new constraint with payment-related statuses
ALTER TABLE placed_orders
ADD CONSTRAINT placed_orders_status_check
CHECK (status = ANY (ARRAY[
    'OPEN'::text,              -- Initial state, waiting for matches
    'MATCHED'::text,           -- Has proposals from farmers  
    'PENDING_BUYER'::text,     -- Proposals created, buyer needs to select
    'PENDING_FARMER'::text,    -- Buyer approved, farmer needs to accept
    'AWAITING_PAYMENT'::text,  -- Farmer accepted, buyer needs to upload payment slip
    'PAID_PENDING_DELIVERY'::text, -- Payment verified, awaiting pickup
    'IN_TRANSIT'::text,        -- Picked up, payment RELEASED to farmer, goods in transit
    'DELIVERED'::text,         -- Delivered to buyer
    'COMPLETED'::text,         -- Final state, all done
    'CANCELLED'::text          -- Order cancelled
]));

-- Add columns if they don't exist (already added by create_payments_table.sql but keeping here for reference)
ALTER TABLE placed_orders 
ADD COLUMN IF NOT EXISTS payment_status VARCHAR(30) DEFAULT 'UNPAID',
ADD COLUMN IF NOT EXISTS total_amount NUMERIC(10, 2),
ADD COLUMN IF NOT EXISTS selected_farmer_id UUID REFERENCES farmer(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS harvest_id UUID REFERENCES estimated_stock(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS blockchain_status TEXT,
ADD COLUMN IF NOT EXISTS transporter_id UUID REFERENCES transporter(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS quality_confirmed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS delivery_notes TEXT;

-- Add payment_status constraint
ALTER TABLE placed_orders
DROP CONSTRAINT IF EXISTS placed_orders_payment_status_check;

ALTER TABLE placed_orders
ADD CONSTRAINT placed_orders_payment_status_check
CHECK (payment_status = ANY (ARRAY[
    'UNPAID'::text,
    'AUTHORIZED'::text,     -- Payment slip verified
    'PENDING_RELEASE'::text, -- Quality confirmed, awaiting release
    'RELEASED'::text,       -- Money sent to farmer
    'REFUNDED'::text        -- Money returned to buyer
]));

-- Add comments for documentation
COMMENT ON COLUMN placed_orders.payment_status IS 'UNPAID: No payment, AUTHORIZED: Slip verified, PENDING_RELEASE: Quality OK awaiting release, RELEASED: Money sent, REFUNDED: Money returned';
COMMENT ON COLUMN placed_orders.total_amount IS 'Final agreed amount calculated as quantity * price_per_kg from selected stock';
COMMENT ON COLUMN placed_orders.selected_farmer_id IS 'Farmer ID when buyer accepts a proposal';
COMMENT ON COLUMN placed_orders.harvest_id IS 'Stock/harvest ID from estimated_stock table';
COMMENT ON COLUMN placed_orders.blockchain_status IS 'Status of blockchain transaction confirmation';
