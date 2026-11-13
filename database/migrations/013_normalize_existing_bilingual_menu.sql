-- Normalize the three legacy bilingual entries to English-first pipe-separated text.
UPDATE menu_items
SET
  item_name = CASE item_id
    WHEN 47 THEN 'Dry Fruits Ghee Laddu (2 pcs) | Kuivattujen hedelmien ja pähkinöiden Ghee-laddu (2 kpl)'
    WHEN 48 THEN 'Moong Dal Halwa | Mungpapuhalva'
    WHEN 49 THEN 'Halloween Eve Special (Meal for One) | Pyhäinpäivän aaton erikoisuus (1 hengelle)'
    ELSE item_name
  END,
  short_information = CASE item_id
    WHEN 47 THEN 'A delicious sweet treat made with nuts and dried fruits. | Pähkinöistä ja kuivatuista hedelmistä valmistettu herkullinen makea herkku.'
    WHEN 48 THEN 'A traditional Indian sweet made with yellow moong lentils, ghee and sugar. | Perinteinen intialainen makea herkku, joka valmistetaan mungpavuista, gheestä ja sokerista.'
    WHEN 49 THEN 'Shahi Paneer + Puri (5 pcs) + Jeera Basmati Rice + Dahi Vada (6 pcs) + Moong Dal Halwa + Dry Fruits Ghee Laddu (1 pc) + Pickle. | Shahi Paneer + Puri (5 kpl) + juustokuminalla maustettu basmatiriisi + Dahi Vada (6 kpl) + mungpapuhalva + kuivattujen hedelmien ja pähkinöiden Ghee-laddu (1 kpl) + pikkelsi.'
    WHEN 50 THEN 'Soft lentil dumplings with semolina, topped with fresh yoghurt and mild spices. | Pehmeitä linssipyöryköitä mannasuurimoilla, tuoreella jogurtilla ja miedoilla mausteilla.'
    WHEN 51 THEN 'Paneer and green peas cooked in a rich tomato and nut gravy. | Paneer-juustoa ja vihreitä herneitä täyteläisessä tomaatti-pähkinäkastikkeessa.'
    WHEN 52 THEN 'Mutter paneer curry served with five puris and two dahi vadas. | Mutter paneer -curry, viisi puria ja kaksi dahi vadaa.'
    WHEN 53 THEN 'A delicious Indian feast with puris, basmati jeera rice, dahi vadas, pickle, vegetable raita and Butter Paneer Masala. Served with our special Palak-E-Khas: rich spinach gravy with cashews, walnuts and paneer. | Herkullinen intialainen ateria, johon kuuluu puria, juustokuminalla maustettua basmatiriisiä, dahi vadaa, pikkelsiä, kasvisraitaa ja Butter Paneer Masalaa. Lisäksi Desi Dawat Special Palak-E-Khas: täyteläinen pinaattikastike cashewpähkinöillä, saksanpähkinöillä ja paneerilla.'
    ELSE short_information
  END
WHERE item_id IN (47, 48, 49)
  AND (item_name NOT LIKE '% | %' OR short_information NOT LIKE '% | %')
   OR item_id IN (50, 51, 52, 53)
  AND short_information NOT LIKE '% | %';
