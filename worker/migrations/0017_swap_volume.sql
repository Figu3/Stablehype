-- Daily swap volume for Clear Protocol
CREATE TABLE IF NOT EXISTS swap_volume (
  date TEXT NOT NULL,
  volume_usd REAL NOT NULL DEFAULT 0,
  swap_count INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (date)
);

-- Track last synced block for incremental fetching
INSERT OR IGNORE INTO blacklist_sync_state (config_key, last_block) VALUES ('clear-swap-volume', 0);
