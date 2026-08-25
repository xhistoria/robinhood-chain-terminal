CREATE TABLE IF NOT EXISTS ingestion_cursors (
  chain_id TEXT PRIMARY KEY,
  last_processed_block INTEGER,
  status TEXT NOT NULL DEFAULT 'unknown',
  updated_at TEXT NOT NULL,
  error_code TEXT
);

CREATE TABLE IF NOT EXISTS token_transfers (
  event_id TEXT PRIMARY KEY,
  token_address TEXT NOT NULL,
  from_address TEXT NOT NULL,
  to_address TEXT NOT NULL,
  value_hex TEXT NOT NULL,
  block_number INTEGER NOT NULL,
  transaction_hash TEXT,
  log_index INTEGER NOT NULL,
  observed_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_token_transfers_token_block ON token_transfers(token_address, block_number DESC);
CREATE INDEX IF NOT EXISTS idx_assets_updated ON assets(last_updated_at DESC);
