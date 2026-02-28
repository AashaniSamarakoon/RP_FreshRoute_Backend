-- Create payments table with bank slip verification support
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES placed_orders(id) ON DELETE CASCADE,
    proposal_id UUID REFERENCES match_proposals(id) ON DELETE SET NULL,
    buyer_id UUID NOT NULL REFERENCES buyers(id) ON DELETE CASCADE,
    amount NUMERIC(10, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'LKR',
    status VARCHAR(30) DEFAULT 'PENDING', 
    -- Status values: PENDING, AUTHORIZED, PENDING_RELEASE, RELEASED, PENDING_REFUND, REFUNDED, FAILED
    payment_method VARCHAR(50) DEFAULT 'bank_slip',
    
    -- Bank slip verification fields
    payment_slip_url TEXT,
    slip_uploaded_at TIMESTAMP WITH TIME ZONE,
    slip_ocr_data JSONB, -- {amount, date, reference, bank, confidence, rawText}
    slip_verification_status VARCHAR(30) DEFAULT 'PENDING', -- PENDING, AUTO_APPROVED, FLAGGED, APPROVED, REJECTED
    slip_verified_by UUID REFERENCES users(id) ON DELETE SET NULL,
    slip_verified_at TIMESTAMP WITH TIME ZONE,
    slip_verification_notes TEXT,
    slip_image_hash VARCHAR(64), -- SHA256 for duplicate detection
    upload_metadata JSONB, -- {ip, userAgent, uploadedAt, fileSize, fileName}
    
    -- Quality confirmation
    quality_confirmed_by UUID REFERENCES transporter(id) ON DELETE SET NULL,
    quality_confirmed_at TIMESTAMP WITH TIME ZONE,
    
    -- Timestamps
    initiated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    authorized_at TIMESTAMP WITH TIME ZONE,
    released_at TIMESTAMP WITH TIME ZONE,
    refunded_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create quality checks table
CREATE TABLE IF NOT EXISTS quality_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES placed_orders(id) ON DELETE CASCADE,
    transporter_id UUID NOT NULL REFERENCES transporter(id) ON DELETE CASCADE,
    quality_score NUMERIC(3, 2), -- e.g., 4.5 out of 5.0
    quality_notes TEXT,
    stock_condition VARCHAR(50), -- EXCELLENT, GOOD, ACCEPTABLE, POOR
    images JSONB, -- Array of image URLs if any
    checked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for payments
CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_buyer_id ON payments(buyer_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_slip_verification_status ON payments(slip_verification_status) 
    WHERE slip_verification_status IN ('PENDING', 'FLAGGED');
CREATE INDEX IF NOT EXISTS idx_payments_slip_image_hash ON payments(slip_image_hash) 
    WHERE slip_image_hash IS NOT NULL;

-- Create indexes for quality checks
CREATE INDEX IF NOT EXISTS idx_quality_checks_order_id ON quality_checks(order_id);
CREATE INDEX IF NOT EXISTS idx_quality_checks_transporter_id ON quality_checks(transporter_id);

-- Add payment fields to placed_orders table
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

-- Add comments
COMMENT ON TABLE payments IS 'Stores payment transactions with bank slip verification and quality-based release';
COMMENT ON TABLE quality_checks IS 'Records transporter quality checks that trigger payment release';

COMMENT ON COLUMN payments.status IS 'PENDING: Initial state, AUTHORIZED: Slip verified, PENDING_RELEASE: Quality confirmed awaiting release, RELEASED: Money sent to farmer, REFUNDED: Money returned to buyer';
COMMENT ON COLUMN payments.payment_slip_url IS 'Supabase storage URL for uploaded bank slip image';
COMMENT ON COLUMN payments.slip_ocr_data IS 'JSON object containing OCR extracted data: {amount, date, reference, bank, confidence}';
COMMENT ON COLUMN payments.slip_verification_status IS 'PENDING: Uploaded, AUTO_APPROVED: Auto-verified, FLAGGED: Needs review, APPROVED: Admin approved, REJECTED: Admin rejected';
COMMENT ON COLUMN payments.slip_image_hash IS 'SHA256 hash for duplicate slip detection';
COMMENT ON COLUMN payments.upload_metadata IS 'JSON object containing: {ip, userAgent, uploadedAt, deviceFingerprint}';

-- Sample query to check payment flow
/*
SELECT 
    p.id,
    p.slip_verification_status,
    p.slip_uploaded_at,
    p.slip_verified_at,
    p.authorized_at,
    p.quality_confirmed_at,
    p.released_at,
    po.status as order_status,
    qc.quality_score,
    qc.stock_condition,
    u.user_metadata->>'name' as verified_by_admin
FROM payments p
LEFT JOIN placed_orders po ON p.order_id = po.id
LEFT JOIN quality_checks qc ON p.order_id = qc.order_id
LEFT JOIN users u ON p.slip_verified_by = u.
FROM payments p
LEFT JOIN placed_orders po ON p.order_id = po.id
LEFT JOIN quality_checks qc ON p.order_id = qc.order_id
ORDER BY p.created_at DESC;
*/
