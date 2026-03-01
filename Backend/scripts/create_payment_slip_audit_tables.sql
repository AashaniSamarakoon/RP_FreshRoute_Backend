-- Create audit log table for payment slip actions
CREATE TABLE IF NOT EXISTS payment_slip_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id UUID NOT NULL REFERENCES payments(id),
    action VARCHAR(50) NOT NULL, -- UPLOADED, AUTO_APPROVED, FLAGGED, APPROVED, REJECTED, VIEWED
    performed_by INTEGER REFERENCES users(id),
    role VARCHAR(20), -- buyer, admin, system
    notes TEXT,
    ip_address VARCHAR(45),
    user_agent TEXT,
    metadata JSONB, -- Additional context like fraud score, OCR confidence, etc.
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create index for faster audit trail lookups
CREATE INDEX IF NOT EXISTS idx_audit_log_payment_id ON payment_slip_audit_log(payment_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON payment_slip_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON payment_slip_audit_log(created_at DESC);

-- Create fraud tracking table
CREATE TABLE IF NOT EXISTS buyer_fraud_scores (
    buyer_id INTEGER PRIMARY KEY REFERENCES buyers(id),
    rejection_count INTEGER DEFAULT 0,
    last_rejection_at TIMESTAMP,
    duplicate_slip_count INTEGER DEFAULT 0,
    suspicious_activity_count INTEGER DEFAULT 0,
    risk_level VARCHAR(20) DEFAULT 'LOW', -- LOW, MEDIUM, HIGH, BLOCKED
    is_blocked BOOLEAN DEFAULT FALSE,
    blocked_at TIMESTAMP,
    blocked_by INTEGER REFERENCES users(id),
    block_reason TEXT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create index for fraud tracking
CREATE INDEX IF NOT EXISTS idx_fraud_scores_risk_level ON buyer_fraud_scores(risk_level);
CREATE INDEX IF NOT EXISTS idx_fraud_scores_blocked ON buyer_fraud_scores(is_blocked) WHERE is_blocked = true;

-- Function to automatically update fraud score when payment is rejected
CREATE OR REPLACE FUNCTION update_fraud_score_on_rejection()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.slip_verification_status = 'REJECTED' AND OLD.slip_verification_status != 'REJECTED' THEN
        -- Insert or update fraud score
        INSERT INTO buyer_fraud_scores (buyer_id, rejection_count, last_rejection_at, updated_at)
        VALUES (NEW.buyer_id, 1, NOW(), NOW())
        ON CONFLICT (buyer_id) DO UPDATE SET
            rejection_count = buyer_fraud_scores.rejection_count + 1,
            last_rejection_at = NOW(),
            updated_at = NOW(),
            risk_level = CASE
                WHEN buyer_fraud_scores.rejection_count + 1 >= 5 THEN 'HIGH'
                WHEN buyer_fraud_scores.rejection_count + 1 >= 3 THEN 'MEDIUM'
                ELSE 'LOW'
            END;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for auto fraud score update
DROP TRIGGER IF EXISTS trigger_update_fraud_score ON payments;
CREATE TRIGGER trigger_update_fraud_score
    AFTER UPDATE ON payments
    FOR EACH ROW
    EXECUTE FUNCTION update_fraud_score_on_rejection();

-- Function to get payment slip statistics (used by admin dashboard)
CREATE OR REPLACE FUNCTION get_payment_slip_stats()
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'total', COUNT(*),
        'pending', COUNT(*) FILTER (WHERE slip_verification_status = 'PENDING'),
        'flagged', COUNT(*) FILTER (WHERE slip_verification_status = 'FLAGGED'),
        'approved', COUNT(*) FILTER (WHERE slip_verification_status = 'APPROVED'),
        'auto_approved', COUNT(*) FILTER (WHERE slip_verification_status = 'AUTO_APPROVED'),
        'rejected', COUNT(*) FILTER (WHERE slip_verification_status = 'REJECTED'),
        'total_amount', COALESCE(SUM(amount) FILTER (WHERE slip_verification_status IN ('APPROVED', 'AUTO_APPROVED')), 0),
        'avg_verification_time_hours', COALESCE(AVG(
            EXTRACT(EPOCH FROM (slip_verified_at - slip_uploaded_at)) / 3600
        ) FILTER (WHERE slip_verified_at IS NOT NULL), 0)
    ) INTO result
    FROM payments
    WHERE payment_method = 'bank_slip';
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE payment_slip_audit_log IS 'Audit trail for all payment slip actions including uploads, approvals, rejections, and views';
COMMENT ON TABLE buyer_fraud_scores IS 'Tracks buyer fraud indicators including rejection counts and risk levels';
COMMENT ON FUNCTION update_fraud_score_on_rejection() IS 'Automatically updates buyer fraud score when payment slip is rejected';
COMMENT ON FUNCTION get_payment_slip_stats() IS 'Returns aggregated statistics for payment slip verification dashboard';
