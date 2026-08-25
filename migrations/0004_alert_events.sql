CREATE TABLE IF NOT EXISTS alert_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  alert_id INTEGER NOT NULL,
  asset_address TEXT NOT NULL,
  kind TEXT NOT NULL,
  message TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  acknowledged INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_alert_events_observed ON alert_events(observed_at DESC);
