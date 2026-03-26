-- Daily snapshots of Clear vault totalAssets for yield tracking
CREATE TABLE IF NOT EXISTS clear_vault_snapshots (
  date TEXT PRIMARY KEY,
  total_assets_usd REAL NOT NULL,
  timestamp INTEGER NOT NULL
);
