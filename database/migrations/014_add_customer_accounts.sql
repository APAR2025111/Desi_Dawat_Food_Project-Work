-- Add registered customer account fields and an optional link from orders.
-- Existing customer profiles remain unregistered, and existing orders remain
-- unlinked guest/history records. No customer or order data is rewritten.
-- Back up the database and apply after 005_add_customer_management.sql.

SET @has_login_email := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'customers'
    AND column_name = 'login_email'
);
SET @sql := IF(@has_login_email = 0,
  'ALTER TABLE customers ADD COLUMN login_email VARCHAR(254) NULL AFTER email',
  'SELECT 1');
PREPARE migration_stmt FROM @sql; EXECUTE migration_stmt; DEALLOCATE PREPARE migration_stmt;

SET @has_password_hash := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'customers'
    AND column_name = 'password_hash'
);
SET @sql := IF(@has_password_hash = 0,
  'ALTER TABLE customers ADD COLUMN password_hash VARCHAR(255) NULL AFTER login_email',
  'SELECT 1');
PREPARE migration_stmt FROM @sql; EXECUTE migration_stmt; DEALLOCATE PREPARE migration_stmt;

SET @has_is_registered := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'customers'
    AND column_name = 'is_registered'
);
SET @sql := IF(@has_is_registered = 0,
  'ALTER TABLE customers ADD COLUMN is_registered BOOLEAN NOT NULL DEFAULT FALSE AFTER password_hash',
  'SELECT 1');
PREPARE migration_stmt FROM @sql; EXECUTE migration_stmt; DEALLOCATE PREPARE migration_stmt;

-- Registration will store login_email in normalized lowercase form so the
-- unique key treats differently-cased versions of the same address equally.
SET @has_login_email_unique := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'customers'
    AND index_name = 'uq_customers_login_email'
);
SET @sql := IF(@has_login_email_unique = 0,
  'ALTER TABLE customers ADD UNIQUE KEY uq_customers_login_email (login_email)',
  'SELECT 1');
PREPARE migration_stmt FROM @sql; EXECUTE migration_stmt; DEALLOCATE PREPARE migration_stmt;

SET @has_order_customer_id := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'customer_orders'
    AND column_name = 'customer_id'
);
SET @sql := IF(@has_order_customer_id = 0,
  'ALTER TABLE customer_orders ADD COLUMN customer_id BIGINT UNSIGNED NULL AFTER order_id',
  'SELECT 1');
PREPARE migration_stmt FROM @sql; EXECUTE migration_stmt; DEALLOCATE PREPARE migration_stmt;

SET @has_order_customer_index := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'customer_orders'
    AND index_name = 'idx_customer_orders_customer_id'
);
SET @sql := IF(@has_order_customer_index = 0,
  'ALTER TABLE customer_orders ADD INDEX idx_customer_orders_customer_id (customer_id)',
  'SELECT 1');
PREPARE migration_stmt FROM @sql; EXECUTE migration_stmt; DEALLOCATE PREPARE migration_stmt;

SET @has_order_customer_fk := (
  SELECT COUNT(*) FROM information_schema.referential_constraints
  WHERE constraint_schema = DATABASE()
    AND table_name = 'customer_orders'
    AND constraint_name = 'fk_customer_orders_customer'
);
SET @sql := IF(@has_order_customer_fk = 0,
  'ALTER TABLE customer_orders ADD CONSTRAINT fk_customer_orders_customer FOREIGN KEY (customer_id) REFERENCES customers(customer_id) ON DELETE SET NULL',
  'SELECT 1');
PREPARE migration_stmt FROM @sql; EXECUTE migration_stmt; DEALLOCATE PREPARE migration_stmt;
