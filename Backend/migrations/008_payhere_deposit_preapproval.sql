-- Add fields to support PayHere preapproval (deposit + token)
ALTER TABLE placed_orders
    ADD COLUMN IF NOT EXISTS payhere_customer_token text,
    ADD COLUMN IF NOT EXISTS deposit_paid numeric DEFAULT 0;

-- payments table already stores amounts; no new columns needed here but we will update records when deposits/captures occur.
