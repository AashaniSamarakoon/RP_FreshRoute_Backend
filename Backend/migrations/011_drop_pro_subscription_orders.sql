-- 011_drop_pro_subscription_orders.sql
-- Removes pro_subscription_orders table because Pro payments use a stateless order_id
-- encoding (PRO_<userId>_<uuid>) and PayHere notify activates subscriptions directly.

DROP TABLE IF EXISTS pro_subscription_orders;
