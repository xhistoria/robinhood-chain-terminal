ALTER TABLE assets ADD COLUMN market_price REAL;
ALTER TABLE assets ADD COLUMN market_liquidity_usd REAL;
ALTER TABLE assets ADD COLUMN market_source TEXT;
ALTER TABLE assets ADD COLUMN market_pair_address TEXT;
ALTER TABLE assets ADD COLUMN market_venue TEXT;
ALTER TABLE assets ADD COLUMN market_updated_at TEXT;
