-- Apply after 014. A NULL value means the registered customer can use the offer once.
-- Store redemption on the account so editing or deleting an order cannot reset it.
SET @has_signup_offer_used_at := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'customers'
    AND column_name = 'signup_offer_used_at'
);
SET @sql := IF(@has_signup_offer_used_at = 0,
  'ALTER TABLE customers ADD COLUMN signup_offer_used_at DATETIME NULL',
  'SELECT 1');
PREPARE migration_stmt FROM @sql; EXECUTE migration_stmt; DEALLOCATE PREPARE migration_stmt;
