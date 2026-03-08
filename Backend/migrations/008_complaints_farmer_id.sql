-- Add farmer_id to complaints (set from placed_orders.selected_farmer_id when buyer creates complaint)
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS farmer_id UUID;

CREATE INDEX IF NOT EXISTS idx_complaints_farmer_id ON complaints(farmer_id);

COMMENT ON COLUMN complaints.farmer_id IS 'Farmer linked to the order at complaint time (from placed_orders.selected_farmer_id)';
