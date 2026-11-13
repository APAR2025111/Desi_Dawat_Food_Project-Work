-- Replace section-prefixed defaults with unique numeric menu item numbers.
-- The original printed codes 1-23 are retained. Remaining dishes receive
-- randomized, unique numbers beginning at 24.
SET @next_menu_item_number := 23;

UPDATE menu_items
SET display_code = CAST((@next_menu_item_number := @next_menu_item_number + 1) AS CHAR)
WHERE display_code NOT REGEXP '^[0-9]+$'
ORDER BY RAND();
