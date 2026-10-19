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
    is_closed BOOLEAN NOT NULL DEFAULT FALSE
);

INSERT IGNORE INTO opening_hours
    (day_key, day_order, day_fi, day_en, open_time, close_time)
VALUES
    ('mon_thu', 1, 'Maanantai–torstai', 'Monday–Thursday', '07:00:00', '22:30:00'),
    ('fri',     2, 'Perjantai',         'Friday',           '07:00:00', '23:30:00'),
    ('sat',     3, 'Lauantai',          'Saturday',         '11:30:00', '23:30:00'),
    ('sun',     4, 'Sunnuntai',         'Sunday',           '11:30:00', '21:30:00');

SELECT * FROM opening_hours ORDER BY day_order;
