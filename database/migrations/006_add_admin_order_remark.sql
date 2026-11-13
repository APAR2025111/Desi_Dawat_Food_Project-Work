-- Add a separate editable admin remark that appears on receipts and reports.
ALTER TABLE customer_orders
  ADD COLUMN admin_remark TEXT NULL;
