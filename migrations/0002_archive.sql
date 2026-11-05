-- CrimeHer D1 schema, v2 (applied to database "crimeher" on 2026-11-05)
-- Adds what the WordPress archive import needs: the resolved original-article
-- link, the old WordPress post id, and a small key/value table for job state.

ALTER TABLE items ADD COLUMN target_url TEXT;   -- original article the old post pointed to; 'none' if it had no outside link
ALTER TABLE items ADD COLUMN wp_id INTEGER;     -- old WordPress post id (archive rows only)
CREATE UNIQUE INDEX IF NOT EXISTS items_wp_id ON items(wp_id);

CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT);
