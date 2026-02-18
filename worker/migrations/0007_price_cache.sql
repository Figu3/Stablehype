CREATE TABLE IF NOT EXISTS price_cache (
  asset_id TEXT PRIMARY KEY,
  price REAL NOT NULL,
  updated_at INTEGER NOT NULL
);
