-- CrimeHer D1 schema, v3: what the feed engine and AI step need.
-- Applied to database "crimeher" through the Cloudflare API on 2026-11-05.

ALTER TABLE sources ADD COLUMN broad INTEGER NOT NULL DEFAULT 0;  -- general-news feed: keyword filter before the AI
ALTER TABLE sources ADD COLUMN last_checked_at TEXT;
ALTER TABLE sources ADD COLUMN last_status TEXT;                  -- HTTP status of the last check, or 'error'
ALTER TABLE sources ADD COLUMN last_error TEXT;
ALTER TABLE sources ADD COLUMN items_seen INTEGER NOT NULL DEFAULT 0;

ALTER TABLE items ADD COLUMN outlet TEXT;      -- the article's own hostname, for the per-outlet cap and last-resort list
ALTER TABLE items ADD COLUMN flags TEXT;       -- the AI's flags as JSON
ALTER TABLE items ADD COLUMN decided_at TEXT;

CREATE INDEX IF NOT EXISTS items_status_source_pub ON items(status, source_published_at DESC);
CREATE INDEX IF NOT EXISTS items_outlet_published ON items(outlet, published_at);
CREATE INDEX IF NOT EXISTS sources_due ON sources(enabled, last_checked_at);
