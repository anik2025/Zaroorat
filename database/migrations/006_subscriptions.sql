CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  owner_phone TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  tier TEXT NOT NULL,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  status TEXT NOT NULL DEFAULT 'pending',
  gateway_order_id TEXT,
  gateway_payment_id TEXT,
  activated_at TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL
);
