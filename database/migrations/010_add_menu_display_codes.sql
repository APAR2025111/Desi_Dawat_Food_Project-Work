-- Add stable, editable customer-facing codes to menu items.
ALTER TABLE menu_items
  ADD COLUMN display_code VARCHAR(24) NULL AFTER item_id;

-- Retain the printed numbers from the existing Desi Dawat menu card.
UPDATE menu_items
SET display_code = CASE LOWER(TRIM(item_name))
  WHEN 'chole' THEN '1'
  WHEN 'rajma' THEN '2'
  WHEN 'dal makhani' THEN '3'
  WHEN 'butter paneer masala' THEN '4'
  WHEN 'kadhai paneer' THEN '5'
  WHEN 'mutter paneer' THEN '6'
  WHEN 'paneer tikka masala' THEN '7'
  WHEN 'palak paneer' THEN '8'
  WHEN 'kaju paneer' THEN '9'
  WHEN 'desi dawat lobio-e-khas' THEN '10'
  WHEN 'puri (5pcs)' THEN '11'
  WHEN 'tofu paratha (2pcs)' THEN '12'
  WHEN 'paneer paratha (2pcs)' THEN '13'
  WHEN 'basmati jeera rice' THEN '14'
  WHEN 'dahi vada (6pcs)' THEN '15'
  WHEN 'diet soft drinks (coke/pepsi/jaffa)' THEN '16'
  WHEN 'full vegetable raita' THEN '17'
  WHEN 'regular curry + puri (5pcs) + basmati jeera rice' THEN '18'
  WHEN 'regular curry meal for one' THEN '19'
  WHEN 'paneer curry meal for one' THEN '20'
  WHEN 'signature curry meal for one' THEN '21'
  WHEN 'paneer curry meal for two' THEN '22'
  WHEN 'signature curry meal for two' THEN '23'
  ELSE display_code
END;

-- Randomly assign unique numbers from 24 upward to items not numbered on the printed menu.
WITH pending_codes AS (
  SELECT item_id, ROW_NUMBER() OVER (ORDER BY RAND()) AS random_number
  FROM menu_items
  WHERE display_code IS NULL OR display_code = ''
)
UPDATE menu_items AS target
JOIN pending_codes ON pending_codes.item_id = target.item_id
SET target.display_code = CAST(23 + pending_codes.random_number AS CHAR);

ALTER TABLE menu_items
  MODIFY COLUMN display_code VARCHAR(24) NOT NULL,
  ADD UNIQUE KEY uq_menu_items_display_code (display_code);
