-- Order snapshots include the dish display number after the dish name.
-- Allow the full name plus that identifier without truncation or failed orders.
ALTER TABLE customer_order_items
  MODIFY COLUMN item_name VARCHAR(255) NOT NULL;
