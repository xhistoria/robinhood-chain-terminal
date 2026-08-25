ALTER TABLE assets ADD COLUMN metadata_status TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE assets ADD COLUMN metadata_source TEXT;
ALTER TABLE assets ADD COLUMN metadata_updated_at TEXT;
