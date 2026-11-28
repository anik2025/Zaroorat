CREATE TABLE IF NOT EXISTS schema_migrations (
  filename TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS businesses (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  whatsapp TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL,
  city TEXT NOT NULL,
  area TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  products TEXT NOT NULL DEFAULT '[]',
  pricing TEXT NOT NULL DEFAULT '',
  images TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'pending',
  is_verified INTEGER NOT NULL DEFAULT 0,
  is_featured INTEGER NOT NULL DEFAULT 0,
  owner_claimed INTEGER NOT NULL DEFAULT 0,
  owner_phone TEXT NOT NULL DEFAULT '',
  owner_verified_at TEXT,
  subscription_tier TEXT,
  subscription_expires_at TEXT,
  rating TEXT,
  review_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT
);
