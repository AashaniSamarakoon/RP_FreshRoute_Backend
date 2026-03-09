-- Add app submission fields to complaints (order_id, reason, status, comments, images)
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS comments TEXT DEFAULT '';
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]';

COMMENT ON COLUMN complaints.comments IS 'Optional comments from app submission.';
COMMENT ON COLUMN complaints.images IS 'Array of base64-encoded image strings from app (e.g. 5 images).';
