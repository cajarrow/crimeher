-- CrimeHer D1 schema, v1 (applied to database "crimeher" on 2026-11-05)

CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  feed_url TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  outlet_type TEXT,
  priority TEXT NOT NULL DEFAULT 'normal', -- normal | last_resort
  enabled INTEGER NOT NULL DEFAULT 1,
  etag TEXT,
  last_modified TEXT,
  last_ok_at TEXT,
  fail_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id TEXT REFERENCES sources(id),
  url TEXT NOT NULL UNIQUE,              -- original article URL; the duplicate check
  guid TEXT,
  title_raw TEXT,
  summary_raw TEXT,
  headline TEXT,                         -- CrimeHer headline
  category TEXT,
  status TEXT NOT NULL DEFAULT 'new',    -- new | published | held | rejected | error
  confidence REAL,
  ai_reason TEXT,
  hold_reason TEXT,
  story_key TEXT,                        -- same case across outlets
  legacy_path TEXT UNIQUE,               -- old WordPress path, for redirects
  source_published_at TEXT,
  fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
  published_at TEXT,
  clicks INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS items_status_published ON items(status, published_at DESC);
CREATE INDEX IF NOT EXISTS items_category_published ON items(category, published_at DESC);
CREATE INDEX IF NOT EXISTS items_story_key ON items(story_key);

CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT,
  feeds_checked INTEGER NOT NULL DEFAULT 0,
  items_new INTEGER NOT NULL DEFAULT 0,
  published INTEGER NOT NULL DEFAULT 0,
  held INTEGER NOT NULL DEFAULT 0,
  rejected INTEGER NOT NULL DEFAULT 0,
  errors INTEGER NOT NULL DEFAULT 0,
  notes TEXT
);
