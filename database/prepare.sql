-- Optional preparation checks for the existing Desi Dawat database.
-- This project explicitly supplies item_id when adding a new row, so AUTO_INCREMENT
-- is not required. This script does not drop or delete data.
USE desi_dawat_menu;
DESCRIBE menu_items;
SELECT COUNT(*) AS total_menu_items FROM menu_items;

-- Store opening hours editable from the Admin page.
CREATE TABLE IF NOT EXISTS opening_hours (
    day_key VARCHAR(20) PRIMARY KEY,
    day_order INT NOT NULL,
    day_fi VARCHAR(50) NOT NULL,
    day_en VARCHAR(50) NOT NULL,
    open_time TIME NOT NULL,
    close_time TIME NOT NULL,
    is_closed BOOLEAN NOT NULL DEFAULT FALSE,
    morning_open TIME NULL,
    morning_close TIME NULL,
    morning_closed BOOLEAN NOT NULL DEFAULT TRUE,
    evening_open TIME NULL,
    evening_close TIME NULL,
    evening_closed BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT IGNORE INTO opening_hours
    (day_key, day_order, day_fi, day_en, open_time, close_time, morning_closed, evening_open, evening_close, evening_closed)
VALUES
        ('mon_thu', 1, 'Maanantai-torstai', 'Monday-Thursday', '19:00:00', '21:00:00', TRUE, '19:00:00', '21:00:00', FALSE),
    ('fri', 2, 'Perjantai', 'Friday', '19:00:00', '21:00:00', TRUE, '19:00:00', '21:00:00', FALSE),
    ('sat', 3, 'Lauantai', 'Saturday', '16:00:00', '21:00:00', TRUE, '16:00:00', '21:00:00', FALSE),
    ('sun', 4, 'Sunnuntai', 'Sunday', '16:00:00', '21:00:00', TRUE, '16:00:00', '21:00:00', FALSE);

SELECT * FROM opening_hours ORDER BY day_order;

CREATE TABLE IF NOT EXISTS about_page_content (
    content_id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    description TEXT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS about_page_media (
    media_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    media_url VARCHAR(500) NOT NULL,
    media_type ENUM('image', 'video') NOT NULL,
    alt_text VARCHAR(255) NULL,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_about_page_media_order (sort_order, media_id)
);

INSERT IGNORE INTO about_page_content (content_id, title, description)
VALUES (1, 'About Desi Dawat', 'Share your kitchen story and introduce the people behind Desi Dawat. You can edit this text and add photos or videos from the admin panel.');
