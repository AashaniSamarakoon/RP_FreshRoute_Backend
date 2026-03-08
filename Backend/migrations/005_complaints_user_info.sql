-- Store submitting user identity with the complaint (user_id already exists; add email and name)
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS user_email VARCHAR(255);
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS user_name VARCHAR(255);

COMMENT ON COLUMN complaints.user_id IS 'Auth user ID who submitted the complaint.';
COMMENT ON COLUMN complaints.user_email IS 'Email of the user who submitted the complaint (at submission time).';
COMMENT ON COLUMN complaints.user_name IS 'Display name of the user who submitted the complaint (at submission time).';
