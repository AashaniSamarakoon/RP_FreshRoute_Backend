-- Image verification status: e.g. "pending", "verified", "rejected"
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS image_verification VARCHAR(50) DEFAULT 'pending';

COMMENT ON COLUMN complaints.image_verification IS 'Image verification status: pending (not yet verified), verified, rejected, etc.';
