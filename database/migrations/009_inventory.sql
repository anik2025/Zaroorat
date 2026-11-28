ALTER TABLE businesses ADD COLUMN availability_status TEXT DEFAULT 'open';
ALTER TABLE businesses ADD COLUMN operating_hours TEXT DEFAULT '{}';

ALTER TABLE catalog_items ADD COLUMN stock_quantity INTEGER DEFAULT 0;
ALTER TABLE catalog_items ADD COLUMN track_stock INTEGER DEFAULT 0;
ALTER TABLE catalog_items ADD COLUMN low_stock_threshold INTEGER DEFAULT 5;
