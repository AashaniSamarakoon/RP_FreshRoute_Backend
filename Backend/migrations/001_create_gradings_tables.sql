-- Migration: Create gradings and grading_images tables
-- Created for: Fruit Grading API Endpoint
-- Date: 2025

-- Main gradings table
CREATE TABLE IF NOT EXISTS gradings (
    grading_id VARCHAR(255) PRIMARY KEY,
    job_id VARCHAR(255) NOT NULL,
    order_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    -- Optional: Add foreign key constraints if job_id and order_id reference other tables
    -- Uncomment the lines below if your transport_jobs and orders tables exist:
    -- CONSTRAINT fk_grading_job FOREIGN KEY (job_id) REFERENCES transport_jobs(id) ON DELETE CASCADE,
    -- CONSTRAINT fk_grading_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

-- Grading images table (one-to-many relationship with gradings)
CREATE TABLE IF NOT EXISTS grading_images (
    id BIGSERIAL PRIMARY KEY,
    grading_id VARCHAR(255) NOT NULL,
    image_base64 TEXT NOT NULL, -- LONGTEXT equivalent in PostgreSQL
    predicted_grade VARCHAR(50) NOT NULL CHECK (predicted_grade IN ('Grade A', 'Grade B', 'Grade C')),
    accuracy DECIMAL(5, 2) NOT NULL CHECK (accuracy >= 0 AND accuracy <= 100),
    sequence INTEGER NOT NULL CHECK (sequence >= 1 AND sequence <= 5),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (grading_id) REFERENCES gradings(grading_id) ON DELETE CASCADE
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_gradings_job_id ON gradings(job_id);
CREATE INDEX IF NOT EXISTS idx_gradings_order_id ON gradings(order_id);
CREATE INDEX IF NOT EXISTS idx_grading_images_grading_id ON grading_images(grading_id);
CREATE INDEX IF NOT EXISTS idx_grading_images_sequence ON grading_images(grading_id, sequence);

-- Add comment to tables
COMMENT ON TABLE gradings IS 'Main table for storing fruit grading records';
COMMENT ON TABLE grading_images IS 'Stores base64 encoded images and AI predictions for each grading';

