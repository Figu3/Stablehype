-- Daily rebalance volume for Clear Protocol
CREATE TABLE IF NOT EXISTS rebalance_volume (
  date TEXT PRIMARY KEY,
  volume_usd REAL NOT NULL DEFAULT 0,
  rebalance_count INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);

-- Sync cursor (reuses blacklist_sync_state pattern)
INSERT OR IGNORE INTO blacklist_sync_state (config_key, last_block) VALUES ('clear-rebalance-volume', 0);

-- Cron health tracking
INSERT OR IGNORE INTO cron_health (job_name) VALUES ('sync-rebalance-volume');
