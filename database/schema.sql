-- KotaMitra initial data model
-- Production migration will be adapted for the selected hosted database.

CREATE TABLE businesses (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  whatsapp TEXT,
  area TEXT NOT NULL,
  address TEXT,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  is_verified INTEGER NOT NULL DEFAULT 0,
  is_featured INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT
);

CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  icon TEXT,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE areas (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE enquiries (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  created_at TEXT NOT NULL,
  FOREIGN KEY (business_id) REFERENCES businesses(id)
);

CREATE TABLE reviews (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  FOREIGN KEY (business_id) REFERENCES businesses(id)
);
