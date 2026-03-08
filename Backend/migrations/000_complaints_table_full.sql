-- Create complaints table (run this in Supabase SQL Editor if the table does not exist)
-- Single script with all columns used by the app and AI layer

CREATE TABLE IF NOT EXISTS complaints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id VARCHAR(255) NOT NULL UNIQUE,
    user_id VARCHAR(255) NOT NULL,
    user_email VARCHAR(255),
    user_name VARCHAR(255),
    user_complaint TEXT NOT NULL,
    agent_description TEXT NOT NULL DEFAULT '',
    proofs TEXT DEFAULT '',
    status VARCHAR(50) DEFAULT 'in review',
    comments TEXT DEFAULT '',
    images JSONB DEFAULT '[]',
    image_verification VARCHAR(50) DEFAULT 'pending',
    comment_thread JSONB DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_complaints_order_id ON complaints(order_id);
CREATE INDEX IF NOT EXISTS idx_complaints_user_id ON complaints(user_id);

COMMENT ON TABLE complaints IS 'User complaints per order; at most one row per order_id.';
