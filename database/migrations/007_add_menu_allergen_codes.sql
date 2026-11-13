-- Store allergen notation codes selected for each menu item.
ALTER TABLE menu_items
  ADD COLUMN allergen_codes VARCHAR(100) NULL;
