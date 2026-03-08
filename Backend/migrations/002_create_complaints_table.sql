-- Migration: Create complaints table (one complaint per order)
-- Used by: AI_layer complaint chat agent tools
-- Date: 2025

CREATE TABLE IF NOT EXISTS complaints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id VARCHAR(255) NOT NULL UNIQUE,
    user_id VARCHAR(255) NOT NULL,
    user_complaint TEXT NOT NULL,
    agent_description TEXT NOT NULL,
    proofs TEXT DEFAULT '',
    status VARCHAR(50) DEFAULT 'in review',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_complaints_order_id ON complaints(order_id);
CREATE INDEX IF NOT EXISTS idx_complaints_user_id ON complaints(user_id);

COMMENT ON TABLE complaints IS 'User complaints per order; at most one row per order_id.';
