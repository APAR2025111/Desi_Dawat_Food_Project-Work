USE desi_dawat_menu;

DESCRIBE menu_items;

SELECT COUNT(*) AS total_menu_items
FROM menu_items;

SELECT item_id, main_category, subcategory, item_name,
       quantity_serving, price_eur, is_available
FROM menu_items
ORDER BY main_category, item_name
LIMIT 10;
