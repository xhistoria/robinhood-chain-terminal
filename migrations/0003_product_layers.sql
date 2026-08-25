CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_address TEXT NOT NULL,
  kind TEXT NOT NULL,
  threshold REAL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  last_triggered_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_alerts_unique ON alerts(asset_address, kind);

CREATE TABLE IF NOT EXISTS paper_trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_address TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
  quantity REAL NOT NULL CHECK (quantity > 0),
  price REAL,
  status TEXT NOT NULL DEFAULT 'paper',
  note TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_paper_trades_asset ON paper_trades(asset_address, created_at DESC);
