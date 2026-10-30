-- Add the customer's requested 30-minute delivery or pickup time.
-- Existing orders remain unchanged and keep NULL for this historical field.
SET @has_preferred_time := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'customer_orders'
    AND column_name = 'preferred_time'
);
SET @sql := IF(@has_preferred_time = 0,
  'ALTER TABLE customer_orders ADD COLUMN preferred_time TIME NULL AFTER delivery_address',
  'SELECT 1');
PREPARE migration_stmt FROM @sql;
EXECUTE migration_stmt;
DEALLOCATE PREPARE migration_stmt;
