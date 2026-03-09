-- Fix typo in placed_orders column name
ALTER TABLE placed_orders
    RENAME COLUMN ready_for_pickup_up_at TO ready_for_pickup_at;

-- After renaming, ensure any dependent objects (indexes, triggers) are updated automatically.
-- The application code already uses the corrected column name.
