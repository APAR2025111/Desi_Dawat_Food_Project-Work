-- Disposable schema fixture for local API/database integration tests only.
-- Do not load this into production. Data inserted by integration tests is fictional.
CREATE DATABASE IF NOT EXISTS desi_dawat_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE desi_dawat_test;

CREATE TABLE menu_items (
  item_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  main_category VARCHAR(100) NOT NULL,
  subcategory VARCHAR(100) NULL,
  item_name VARCHAR(200) NOT NULL,
  quantity_serving VARCHAR(100) NULL,
  price_eur DECIMAL(10,2) NOT NULL,
  short_information TEXT NULL,
  image_url TEXT NULL,
  is_available TINYINT(1) NOT NULL DEFAULT 1
);

CREATE TABLE opening_hours (
  day_key VARCHAR(20) PRIMARY KEY,
  day_order INT NOT NULL,
  day_fi VARCHAR(50) NOT NULL,
  day_en VARCHAR(50) NOT NULL,
  open_time TIME NULL,
  close_time TIME NULL,
  is_closed BOOLEAN NOT NULL DEFAULT FALSE,
  morning_open TIME NULL,
  morning_close TIME NULL,
  morning_closed BOOLEAN NOT NULL DEFAULT TRUE,
  evening_open TIME NULL,
  evening_close TIME NULL,
  evening_closed BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE customer_orders (
  order_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  customer_name VARCHAR(200) NOT NULL,
  customer_phone VARCHAR(50) NOT NULL,
  order_type ENUM('delivery','takeaway') NOT NULL,
  payment_method VARCHAR(50) NOT NULL,
  delivery_address TEXT NULL,
  preferred_time TIME NULL,
  customer_notes TEXT NULL,
  delivery_charge DECIMAL(10,2) NOT NULL DEFAULT 0,
  discount_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
  discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  delivery_distance_km DECIMAL(8,2) NULL,
  total_amount DECIMAL(10,2) NOT NULL,
  order_status VARCHAR(30) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE customers (
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

CREATE TABLE customer_order_items (
  order_item_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  item_id INT NOT NULL,
  item_name VARCHAR(200) NOT NULL,
  quantity INT NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  line_total DECIMAL(10,2) NOT NULL,
  CONSTRAINT fk_test_order_item_order FOREIGN KEY (order_id)
    REFERENCES customer_orders(order_id) ON DELETE CASCADE
);

CREATE TABLE inventory_items (
  item_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  category ENUM('packing','food') NOT NULL,
  item_name VARCHAR(200) NOT NULL,
  item_name_hindi VARCHAR(200) NULL,
  item_name_finnish VARCHAR(200) NULL,
  rack_number INT NULL,
  item_size VARCHAR(100) NULL,
  quantity DECIMAL(10,2) NULL,
  unit VARCHAR(30) NOT NULL DEFAULT 'pieces',
  availability ENUM('available','low_stock','out_of_stock','not_confirmed') NOT NULL DEFAULT 'available',
  expiry_date DATE NULL,
  expiry_note VARCHAR(100) NULL,
  notes TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE about_page_content (
  content_id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  description TEXT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE about_page_media (
  media_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  media_url VARCHAR(500) NOT NULL,
  media_type ENUM('image', 'video') NOT NULL,
  alt_text VARCHAR(255) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_about_page_media_order (sort_order, media_id)
);

INSERT INTO about_page_content (content_id, title, description)
VALUES (1, 'About Desi Dawat', 'Share your kitchen story and introduce the people behind Desi Dawat.');

INSERT INTO menu_items
  (main_category, subcategory, item_name, quantity_serving, price_eur, short_information, image_url, is_available)
VALUES
  ('Curries', 'Paneer', 'Test Shahi Paneer', 'Serves 1', 12.50, 'Disposable integration-test item', NULL, 1),
  ('Curries', 'Paneer', 'Hidden Test Dish', 'Serves 1', 9.00, 'Must not appear on public menu', NULL, 0);

INSERT INTO opening_hours
  (day_key, day_order, day_fi, day_en, open_time, close_time, is_closed,
   morning_open, morning_close, morning_closed, evening_open, evening_close, evening_closed)
VALUES
  ('mon_thu', 1, 'Maanantai–torstai', 'Monday–Thursday', '09:00', '20:00', 0, '09:00', '14:00', 0, '16:00', '20:00', 0),
  ('fri', 2, 'Perjantai', 'Friday', '09:00', '20:00', 0, '09:00', '14:00', 0, '16:00', '20:00', 0),
  ('sat', 3, 'Lauantai', 'Saturday', '11:00', '19:00', 0, '11:00', '15:00', 0, '16:00', '19:00', 0),
  ('sun', 4, 'Sunnuntai', 'Sunday', NULL, NULL, 1, NULL, NULL, 1, NULL, NULL, 1);
