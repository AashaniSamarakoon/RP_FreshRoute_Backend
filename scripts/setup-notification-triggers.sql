-- ============================================
-- AUTO-NOTIFICATION TRIGGERS
-- Automatically create notifications on data changes
-- ============================================

-- ============================================
-- 1. TRIGGER: New Forecast → Notify farmers
-- ============================================
CREATE OR REPLACE FUNCTION notify_on_new_forecast()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert notification for all farmers with SMS enabled
  INSERT INTO notifications (user_id, title, body, category, severity)
  SELECT 
    u.id,
    '🌱 New ' || NEW.fruit || ' Forecast',
    'Expected ' || NEW.fruit || ' price: Rs. ' || ROUND(NEW.forecast_value::numeric, 2) || '/kg on ' || NEW.date,
    'price_alert',
    CASE 
      WHEN ABS(NEW.forecast_value - (SELECT AVG(price_per_unit) FROM economic_center_prices WHERE fruit_name = NEW.fruit)) > 100 THEN 'critical'
      WHEN ABS(NEW.forecast_value - (SELECT AVG(price_per_unit) FROM economic_center_prices WHERE fruit_name = NEW.fruit)) > 50 THEN 'warning'
      ELSE 'info'
    END
  FROM users u
  WHERE u.role = 'farmer' AND u.sms_alerts_enabled = true;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS forecast_notification_trigger ON forecasts;
CREATE TRIGGER forecast_notification_trigger
AFTER INSERT ON forecasts
FOR EACH ROW
EXECUTE FUNCTION notify_on_new_forecast();

-- ============================================
-- 2. TRIGGER: Economic Center Price Update → Notify farmers
-- ============================================
CREATE OR REPLACE FUNCTION notify_on_price_update()
RETURNS TRIGGER AS $$
DECLARE
  prev_price DECIMAL;
  price_change DECIMAL;
  trend TEXT;
BEGIN
  -- Get previous price for this fruit
  SELECT price_per_unit INTO prev_price
  FROM economic_center_prices
  WHERE fruit_name = NEW.fruit_name 
  AND economic_center = NEW.economic_center
  AND captured_at < NEW.captured_at
  ORDER BY captured_at DESC
  LIMIT 1;

  -- Calculate price change
  IF prev_price IS NOT NULL THEN
    price_change := NEW.price_per_unit - prev_price;
    trend := CASE 
      WHEN price_change > 0 THEN '⬆️ UP'
      WHEN price_change < 0 THEN '⬇️ DOWN'
      ELSE '➡️ STABLE'
    END;

    -- Insert notification for farmers
    INSERT INTO notifications (user_id, title, body, category, severity)
    SELECT 
      u.id,
      '💰 ' || NEW.fruit_name || ' Price Update - ' || trend,
      NEW.fruit_name || ' at ' || NEW.economic_center || ': Rs. ' || ROUND(NEW.price_per_unit::numeric, 2) || '/kg (was Rs. ' || ROUND(prev_price::numeric, 2) || ')',
      'price_alert',
      CASE 
        WHEN ABS(price_change) > 100 THEN 'critical'
        WHEN ABS(price_change) > 50 THEN 'warning'
        ELSE 'info'
      END
    FROM users u
    WHERE u.role = 'farmer' AND u.sms_alerts_enabled = true;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS price_update_notification_trigger ON economic_center_prices;
CREATE TRIGGER price_update_notification_trigger
AFTER INSERT ON economic_center_prices
FOR EACH ROW
EXECUTE FUNCTION notify_on_price_update();

-- ============================================
-- 3. TRIGGER: SMS Log → Notify relevant farmer
-- ============================================
CREATE OR REPLACE FUNCTION notify_on_sms_send()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO notifications (user_id, title, body, category, severity)
  VALUES (
    NEW.farmer_id,
    CASE 
      WHEN NEW.status = 'sent' THEN '✅ Price Alert Sent'
      WHEN NEW.status = 'failed' THEN '❌ Alert Delivery Failed'
      ELSE '⏳ Alert Pending'
    END,
    'SMS sent to ' || NEW.phone || ' at ' || NEW.sent_at,
    'system',
    CASE 
      WHEN NEW.status = 'failed' THEN 'warning'
      ELSE 'info'
    END
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sms_notification_trigger ON sms_logs;
CREATE TRIGGER sms_notification_trigger
AFTER INSERT ON sms_logs
FOR EACH ROW
EXECUTE FUNCTION notify_on_sms_send();

-- ============================================
-- 4. TRIGGER: Mark old notifications as read (7 days old)
-- ============================================
CREATE OR REPLACE FUNCTION archive_old_notifications()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE notifications
  SET read_at = NOW()
  WHERE created_at < NOW() - INTERVAL '7 days'
  AND read_at IS NULL;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Run this daily
-- DROP TRIGGER IF EXISTS notification_archival_trigger ON notifications;

-- ============================================
-- Test: Insert a forecast and check notifications
-- ============================================
-- INSERT INTO forecasts (fruit, target, date, forecast_value)
-- VALUES ('Mango', 'price', CURRENT_DATE, 650.00);
-- 
-- SELECT * FROM notifications WHERE created_at > NOW() - INTERVAL '1 minute';
