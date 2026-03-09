-- Comment thread: each entry has role (user/admin) and comment text
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS comment_thread JSONB DEFAULT '[]';

COMMENT ON COLUMN complaints.comment_thread IS 'Array of { role: "user"|"admin", comment: string, added_at: string (ISO) }';
