-- In the ten-code list, sesame moves from A6 to A8; preserve existing selections.
UPDATE menu_items
SET allergen_codes = TRIM(BOTH ',' FROM REPLACE(CONCAT(',', allergen_codes, ','), ',A6,', ',A8,'))
WHERE FIND_IN_SET('A6', allergen_codes) > 0;
