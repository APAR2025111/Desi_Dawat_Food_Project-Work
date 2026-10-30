-- Read-only schema preflight for a staging copy of Desi Dawat's MySQL database.
-- Select the target database before running this file. It does not change data.
-- Opening-hours and discount columns introduced by migration 001 may appear
-- as MISSING before that migration is applied to staging.
-- About Us tables introduced by migration 003 may also appear as MISSING.

SELECT DATABASE() AS selected_database;

SELECT required.table_name, required.column_name,
       CASE WHEN actual.column_name IS NULL THEN 'MISSING' ELSE 'OK' END AS status
FROM (
    SELECT 'menu_items' AS table_name, 'item_id' AS column_name UNION ALL
    SELECT 'menu_items', 'main_category' UNION ALL
    SELECT 'menu_items', 'subcategory' UNION ALL
    SELECT 'menu_items', 'item_name' UNION ALL
    SELECT 'menu_items', 'quantity_serving' UNION ALL
    SELECT 'menu_items', 'price_eur' UNION ALL
    SELECT 'menu_items', 'short_information' UNION ALL
    SELECT 'menu_items', 'image_url' UNION ALL
    SELECT 'menu_items', 'is_available' UNION ALL
    SELECT 'opening_hours', 'day_key' UNION ALL
    SELECT 'opening_hours', 'day_order' UNION ALL
    SELECT 'opening_hours', 'day_fi' UNION ALL
    SELECT 'opening_hours', 'day_en' UNION ALL
    SELECT 'opening_hours', 'open_time' UNION ALL
    SELECT 'opening_hours', 'close_time' UNION ALL
    SELECT 'opening_hours', 'is_closed' UNION ALL
    SELECT 'opening_hours', 'morning_open' UNION ALL
    SELECT 'opening_hours', 'morning_close' UNION ALL
    SELECT 'opening_hours', 'morning_closed' UNION ALL
    SELECT 'opening_hours', 'evening_open' UNION ALL
    SELECT 'opening_hours', 'evening_close' UNION ALL
    SELECT 'opening_hours', 'evening_closed' UNION ALL
    SELECT 'customer_orders', 'order_id' UNION ALL
    SELECT 'customer_orders', 'customer_name' UNION ALL
    SELECT 'customer_orders', 'customer_phone' UNION ALL
    SELECT 'customer_orders', 'order_type' UNION ALL
    SELECT 'customer_orders', 'payment_method' UNION ALL
    SELECT 'customer_orders', 'delivery_address' UNION ALL
    SELECT 'customer_orders', 'customer_notes' UNION ALL
    SELECT 'customer_orders', 'delivery_charge' UNION ALL
    SELECT 'customer_orders', 'discount_percent' UNION ALL
    SELECT 'customer_orders', 'discount_amount' UNION ALL
    SELECT 'customer_orders', 'delivery_distance_km' UNION ALL
    SELECT 'customer_orders', 'total_amount' UNION ALL
    SELECT 'customer_orders', 'order_status' UNION ALL
    SELECT 'customer_orders', 'created_at' UNION ALL
    SELECT 'customer_order_items', 'order_item_id' UNION ALL
    SELECT 'customer_order_items', 'order_id' UNION ALL
    SELECT 'customer_order_items', 'item_id' UNION ALL
    SELECT 'customer_order_items', 'item_name' UNION ALL
    SELECT 'customer_order_items', 'quantity' UNION ALL
    SELECT 'customer_order_items', 'unit_price' UNION ALL
    SELECT 'customer_order_items', 'line_total' UNION ALL
    SELECT 'inventory_items', 'item_id' UNION ALL
    SELECT 'inventory_items', 'category' UNION ALL
    SELECT 'inventory_items', 'item_name' UNION ALL
    SELECT 'inventory_items', 'item_name_hindi' UNION ALL
    SELECT 'inventory_items', 'item_name_finnish' UNION ALL
    SELECT 'inventory_items', 'rack_number' UNION ALL
    SELECT 'inventory_items', 'item_size' UNION ALL
    SELECT 'inventory_items', 'quantity' UNION ALL
    SELECT 'inventory_items', 'unit' UNION ALL
    SELECT 'inventory_items', 'availability' UNION ALL
    SELECT 'inventory_items', 'expiry_date' UNION ALL
    SELECT 'inventory_items', 'expiry_note' UNION ALL
    SELECT 'inventory_items', 'notes' UNION ALL
    SELECT 'about_page_content', 'content_id' UNION ALL
    SELECT 'about_page_content', 'title' UNION ALL
    SELECT 'about_page_content', 'description' UNION ALL
    SELECT 'about_page_media', 'media_id' UNION ALL
    SELECT 'about_page_media', 'media_url' UNION ALL
    SELECT 'about_page_media', 'media_type' UNION ALL
    SELECT 'about_page_media', 'alt_text' UNION ALL
    SELECT 'about_page_media', 'sort_order'
) AS required
LEFT JOIN information_schema.columns AS actual
  ON actual.table_schema = DATABASE()
 AND actual.table_name = required.table_name
 AND actual.column_name = required.column_name
ORDER BY required.table_name, required.column_name;
