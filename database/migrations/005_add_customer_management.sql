-- Customer profiles and reversible archiving for Customer Management.
-- Run this additive migration once against the target Desi Dawat database.
-- Existing orders and order items are preserved and used to seed profiles.

CREATE TABLE IF NOT EXISTS customers (
  customer_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  customer_name VARCHAR(200) NOT NULL,
  customer_phone VARCHAR(50) NOT NULL,
  phone_normalized VARCHAR(50) NOT NULL,
  email VARCHAR(254) NULL,
  delivery_address VARCHAR(500) NULL,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_customers_phone_normalized (phone_normalized),
  INDEX idx_customers_archived_name (is_archived, customer_name)
);

-- Normalize common phone formatting characters while retaining country digits.
-- The same normalization is applied by the API when a profile is created.
INSERT INTO customers (customer_name, customer_phone, phone_normalized, delivery_address)
SELECT MAX(customer_name), MAX(customer_phone), normalized_phone, MAX(delivery_address)
FROM (
  SELECT
    customer_name,
    customer_phone,
    delivery_address,
    REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(customer_phone), ' ', ''), '-', ''), '(', ''), ')', ''), '+', ''), '.', '') AS normalized_phone
  FROM customer_orders
  WHERE customer_phone IS NOT NULL AND TRIM(customer_phone) <> ''
) AS existing_customers
WHERE normalized_phone <> ''
GROUP BY normalized_phone
ON DUPLICATE KEY UPDATE customer_id = customer_id;
