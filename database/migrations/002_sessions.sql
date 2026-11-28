CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  capabilities TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS customer_otps (
  phone TEXT PRIMARY KEY,
  otp_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  cooldown_until INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0
);
