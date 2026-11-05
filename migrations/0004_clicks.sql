-- CrimeHer D1 schema, v4: one row per outbound click, for the desk's Stats tab.
-- Applied to database "crimeher" through the Cloudflare API on 2026-11-05.

CREATE TABLE IF NOT EXISTS clicks (
  item_id INTEGER NOT NULL,
  at TEXT NOT NULL,
  preview INTEGER NOT NULL DEFAULT 0   -- 1 = click on the private preview (testing), 0 = crimeher.com
);
CREATE INDEX IF NOT EXISTS clicks_at ON clicks(at);
CREATE INDEX IF NOT EXISTS clicks_item ON clicks(item_id);
