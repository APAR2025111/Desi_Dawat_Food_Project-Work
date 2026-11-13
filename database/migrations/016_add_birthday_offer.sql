-- Apply after 015, before starting the birthday-offer version of the API.
-- Existing accounts start without a saved date or a redeemed birthday offer.
SET @has_date_of_birth := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'customers' AND column_name = 'date_of_birth'
);
SET @sql := IF(@has_date_of_birth = 0,
  'ALTER TABLE customers ADD COLUMN date_of_birth DATE NULL',
  'SELECT 1');
PREPARE migration_stmt FROM @sql; EXECUTE migration_stmt; DEALLOCATE PREPARE migration_stmt;

SET @has_birthday_offer_used_year := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'customers' AND column_name = 'birthday_offer_used_year'
);
SET @sql := IF(@has_birthday_offer_used_year = 0,
  'ALTER TABLE customers ADD COLUMN birthday_offer_used_year SMALLINT UNSIGNED NULL',
  'SELECT 1');
PREPARE migration_stmt FROM @sql; EXECUTE migration_stmt; DEALLOCATE PREPARE migration_stmt;
