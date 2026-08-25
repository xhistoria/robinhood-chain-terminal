CREATE TABLE IF NOT EXISTS chain_status (
  chain_id TEXT PRIMARY KEY,
  latest_block INTEGER,
  observed_at TEXT NOT NULL,
  provider TEXT NOT NULL,
  status TEXT NOT NULL,
  latency_ms INTEGER,
  error_code TEXT
);

CREATE TABLE IF NOT EXISTS assets (
  address TEXT PRIMARY KEY,
  symbol TEXT,
  name TEXT,
  asset_type TEXT NOT NULL DEFAULT 'unknown',
  transferability TEXT NOT NULL DEFAULT 'unknown',
  market_status TEXT NOT NULL DEFAULT 'unknown',
  last_seen_block INTEGER,
  last_updated_at TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS watchlist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_address TEXT NOT NULL REFERENCES assets(address),
  created_at TEXT NOT NULL,
  UNIQUE(asset_address)
);
