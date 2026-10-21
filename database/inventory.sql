
-- Desi Dawat Inventory

CREATE TABLE IF NOT EXISTS inventory_items (
    item_id INT AUTO_INCREMENT PRIMARY KEY,
    category ENUM('packing', 'food') NOT NULL,
    item_name VARCHAR(200) NOT NULL,
    item_name_hindi VARCHAR(200) NULL,
    item_name_finnish VARCHAR(200) NULL,
    rack_number INT NULL,
    item_size VARCHAR(100) NULL,
    quantity DECIMAL(10,2) NULL,
    unit VARCHAR(30) NOT NULL DEFAULT 'pieces',
    availability ENUM(
        'available',
        'low_stock',
        'out_of_stock',
        'not_confirmed'
    ) NOT NULL DEFAULT 'available',
    expiry_date DATE NULL,
    expiry_note VARCHAR(100) NULL,
    notes TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP
);
