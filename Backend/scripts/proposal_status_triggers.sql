-- Database Triggers for Automatic Status Updates
-- Run this in Supabase SQL Editor to ensure status consistency

-- Trigger function to handle proposal status changes
CREATE OR REPLACE FUNCTION handle_proposal_status_change()
RETURNS TRIGGER AS $$
BEGIN
  -- When a proposal is accepted
  IF NEW.status = 'ACCEPTED' AND OLD.status != 'ACCEPTED' THEN
    -- Update order to AWAITING_PAYMENT and record the matched farmer/stock
    UPDATE placed_orders
    SET status             = 'AWAITING_PAYMENT',
        selected_farmer_id = (SELECT farmer_id FROM estimated_stock WHERE id = NEW.stock_id),
        harvest_id         = NEW.stock_id,
        updated_at         = NOW()
    WHERE id = NEW.order_id;

    -- Lock the accepted stock as MATCHED
    UPDATE estimated_stock
    SET status           = 'MATCHED',
        reserved_until   = NULL,
        reserved_for_order = NULL,
        updated_at       = NOW()
    WHERE id = NEW.stock_id;

    -- Cancel all other competing proposals for this order
    UPDATE match_proposals
    SET status     = 'CANCELLED',
        updated_at = NOW()
    WHERE order_id = NEW.order_id
      AND id       != NEW.id
      AND status   IN ('PENDING_BUYER', 'PENDING_FARMER');

    -- Release stock held by those cancelled proposals back to OPEN
    UPDATE estimated_stock
    SET status             = 'OPEN',
        reserved_until     = NULL,
        reserved_for_order = NULL,
        updated_at         = NOW()
    WHERE id IN (
      SELECT stock_id FROM match_proposals
      WHERE order_id = NEW.order_id
        AND id       != NEW.id
        AND status   = 'CANCELLED'
    );

  -- When a proposal is rejected by the farmer
  ELSIF NEW.status = 'REJECTED' AND OLD.status != 'REJECTED' THEN
    -- Release the rejected stock back to OPEN
    UPDATE estimated_stock
    SET status             = 'OPEN',
        reserved_until     = NULL,
        reserved_for_order = NULL,
        updated_at         = NOW()
    WHERE id = NEW.stock_id;

    -- Reset order status:
    --   • If other PENDING_BUYER proposals remain → buyer can still pick one → PENDING_BUYER
    --   • Otherwise the order needs fresh matching → OPEN
    UPDATE placed_orders
    SET status     = CASE
                       WHEN EXISTS (
                         SELECT 1 FROM match_proposals
                         WHERE order_id = NEW.order_id
                           AND id      != NEW.id
                           AND status  = 'PENDING_BUYER'
                       ) THEN 'PENDING_BUYER'
                       ELSE 'OPEN'
                     END,
        updated_at = NOW()
    WHERE id = NEW.order_id;

  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
DROP TRIGGER IF EXISTS proposal_status_change_trigger ON match_proposals;
CREATE TRIGGER proposal_status_change_trigger
  AFTER UPDATE OF status ON match_proposals
  FOR EACH ROW
  EXECUTE FUNCTION handle_proposal_status_change();

-- Add comments for documentation
COMMENT ON FUNCTION handle_proposal_status_change() IS 'Automatically updates order and stock statuses when proposal status changes';
COMMENT ON TRIGGER proposal_status_change_trigger ON match_proposals IS 'Triggers automatic status updates for orders and stocks when proposals are accepted/rejected';