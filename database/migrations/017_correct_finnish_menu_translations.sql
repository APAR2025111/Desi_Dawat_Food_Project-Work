-- Correct Finnish menu wording in existing bilingual rows.
UPDATE menu_items
SET item_name = REPLACE(item_name, 'Punapapucurry', 'Kidneypapucurry')
WHERE item_id = 2;

UPDATE menu_items
SET item_name = REPLACE(item_name, 'Jeeralla maustettu basmatiriisi', 'Juustokuminalla maustettu basmatiriisi')
WHERE item_id = 24;

UPDATE menu_items
SET item_name = REPLACE(item_name, 'jeeralla maustettua basmatiriisiä', 'juustokuminalla maustettua basmatiriisiä')
WHERE item_id = 32;

UPDATE menu_items
SET short_information = REPLACE(short_information, 'jeeralla maustettu basmatiriisi', 'juustokuminalla maustettu basmatiriisi')
WHERE item_id = 49;

UPDATE menu_items
SET short_information = REPLACE(short_information, 'basmatijeerariisiä', 'juustokuminalla maustettua basmatiriisiä')
WHERE item_id = 53;
