-- Daily Briefing signups, collected on the site until the email service (Kit) is connected.
CREATE TABLE IF NOT EXISTS signups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  source TEXT,                 -- the page they signed up on
  synced_at TEXT               -- when it was sent to the email service
);
CREATE INDEX IF NOT EXISTS signups_created ON signups(created_at);
