CREATE TABLE IF NOT EXISTS surprise_reward_state (
  state_id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  qualifying_order_count BIGINT UNSIGNED NOT NULL DEFAULT 0
);

INSERT INTO surprise_reward_state (state_id, qualifying_order_count)
VALUES (1, 0)
ON DUPLICATE KEY UPDATE state_id = VALUES(state_id);

CREATE TABLE IF NOT EXISTS surprise_reward_settings (
  settings_id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  validity_days SMALLINT UNSIGNED NOT NULL DEFAULT 15,
  cycle_config JSON NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT INTO surprise_reward_settings (settings_id, validity_days, cycle_config)
VALUES (
  1,
  15,
  JSON_ARRAY(
    JSON_OBJECT('type','percent','min',1,'max',5),
    JSON_OBJECT('type','percent','min',1,'max',5),
    JSON_OBJECT('type','percent','min',1,'max',5),
    JSON_OBJECT('type','percent','min',1,'max',5),
    JSON_OBJECT('type','percent','min',1,'max',5),
    JSON_OBJECT('type','addon'), JSON_OBJECT('type','addon'), JSON_OBJECT('type','addon'),
    JSON_OBJECT('type','addon'), JSON_OBJECT('type','addon'), JSON_OBJECT('type','addon'),
    JSON_OBJECT('type','percent','min',6,'max',8),
    JSON_OBJECT('type','percent','min',6,'max',8),
    JSON_OBJECT('type','percent','min',6,'max',8),
    JSON_OBJECT('type','percent','min',9,'max',10)
  )
)
ON DUPLICATE KEY UPDATE settings_id = VALUES(settings_id);

CREATE TABLE IF NOT EXISTS surprise_reward_addon_items (
  item_id INT NOT NULL PRIMARY KEY,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_surprise_reward_addon_item
    FOREIGN KEY (item_id) REFERENCES menu_items(item_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS customer_surprise_rewards (
  reward_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  sequence_position TINYINT UNSIGNED NOT NULL,
  customer_id BIGINT UNSIGNED NOT NULL,
  qualifying_order_id INT NOT NULL,
  reward_type ENUM('percent', 'addon') NOT NULL,
  reward_value DECIMAL(5,2) NULL,
  addon_item_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  redeemed_at DATETIME NULL,
  redemption_order_id INT NULL,
  UNIQUE KEY uq_customer_surprise_qualifying_order (qualifying_order_id),
  INDEX idx_customer_surprise_available (customer_id, expires_at, redeemed_at),
  CONSTRAINT fk_surprise_reward_customer
    FOREIGN KEY (customer_id) REFERENCES customers(customer_id) ON DELETE CASCADE,
  CONSTRAINT fk_surprise_reward_qualifying_order
    FOREIGN KEY (qualifying_order_id) REFERENCES customer_orders(order_id) ON DELETE CASCADE,
  CONSTRAINT fk_surprise_reward_addon
    FOREIGN KEY (addon_item_id) REFERENCES menu_items(item_id) ON DELETE SET NULL,
  CONSTRAINT fk_surprise_reward_redemption_order
    FOREIGN KEY (redemption_order_id) REFERENCES customer_orders(order_id) ON DELETE SET NULL
);
