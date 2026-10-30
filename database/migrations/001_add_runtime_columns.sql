-- Additive migration for schemas used by the current API.
-- Back up the database and run against staging first. This script preserves
-- existing opening-hours rows and order totals; it does not delete data.
-- Select the intended staging schema in your SQL client before running this file.

-- Add split opening-hour columns only when absent. The legacy open_time /
-- close_time / is_closed values remain intact and are copied to the morning
-- session only when the split-session schema did not previously exist.
SET @had_morning_open := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'opening_hours' AND column_name = 'morning_open'
);

SET @has_morning_open := @had_morning_open;
SET @sql := IF(@has_morning_open = 0,
  'ALTER TABLE opening_hours ADD COLUMN morning_open TIME NULL', 'SELECT 1');
PREPARE migration_stmt FROM @sql; EXECUTE migration_stmt; DEALLOCATE PREPARE migration_stmt;

SET @has_morning_close := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'opening_hours' AND column_name = 'morning_close');
SET @sql := IF(@has_morning_close = 0, 'ALTER TABLE opening_hours ADD COLUMN morning_close TIME NULL', 'SELECT 1');
PREPARE migration_stmt FROM @sql; EXECUTE migration_stmt; DEALLOCATE PREPARE migration_stmt;

SET @has_morning_closed := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'opening_hours' AND column_name = 'morning_closed');
SET @sql := IF(@has_morning_closed = 0, 'ALTER TABLE opening_hours ADD COLUMN morning_closed BOOLEAN NOT NULL DEFAULT TRUE', 'SELECT 1');
PREPARE migration_stmt FROM @sql; EXECUTE migration_stmt; DEALLOCATE PREPARE migration_stmt;

SET @has_evening_open := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'opening_hours' AND column_name = 'evening_open');
SET @sql := IF(@has_evening_open = 0, 'ALTER TABLE opening_hours ADD COLUMN evening_open TIME NULL', 'SELECT 1');
PREPARE migration_stmt FROM @sql; EXECUTE migration_stmt; DEALLOCATE PREPARE migration_stmt;

SET @has_evening_close := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'opening_hours' AND column_name = 'evening_close');
SET @sql := IF(@has_evening_close = 0, 'ALTER TABLE opening_hours ADD COLUMN evening_close TIME NULL', 'SELECT 1');
PREPARE migration_stmt FROM @sql; EXECUTE migration_stmt; DEALLOCATE PREPARE migration_stmt;

SET @has_evening_closed := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'opening_hours' AND column_name = 'evening_closed');
SET @sql := IF(@has_evening_closed = 0, 'ALTER TABLE opening_hours ADD COLUMN evening_closed BOOLEAN NOT NULL DEFAULT TRUE', 'SELECT 1');
PREPARE migration_stmt FROM @sql; EXECUTE migration_stmt; DEALLOCATE PREPARE migration_stmt;

SET @sql := IF(@had_morning_open = 0,
  'UPDATE opening_hours SET morning_open = IF(is_closed, NULL, open_time), morning_close = IF(is_closed, NULL, close_time), morning_closed = is_closed, evening_closed = TRUE',
  'SELECT 1');
PREPARE migration_stmt FROM @sql; EXECUTE migration_stmt; DEALLOCATE PREPARE migration_stmt;

-- The API expects these order-discount columns. Existing order values are kept
-- at their prior totals; the new discount values start at zero.
SET @has_discount_percent := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'customer_orders' AND column_name = 'discount_percent');
SET @sql := IF(@has_discount_percent = 0, 'ALTER TABLE customer_orders ADD COLUMN discount_percent DECIMAL(5,2) NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE migration_stmt FROM @sql; EXECUTE migration_stmt; DEALLOCATE PREPARE migration_stmt;

SET @has_discount_amount := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'customer_orders' AND column_name = 'discount_amount');
SET @sql := IF(@has_discount_amount = 0, 'ALTER TABLE customer_orders ADD COLUMN discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE migration_stmt FROM @sql; EXECUTE migration_stmt; DEALLOCATE PREPARE migration_stmt;
