-- Add status column to complaints if table was created before status existed
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'in review';
