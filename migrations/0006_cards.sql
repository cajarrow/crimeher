-- Headline card images for social posts and link previews (src/cards.js). Base64 so D1 stores them as text.
CREATE TABLE IF NOT EXISTS cards (
  k TEXT PRIMARY KEY,          -- "<item id>-<format>-<headline hash>"
  item_id INTEGER NOT NULL,
  mime TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS cards_created ON cards (created_at);
