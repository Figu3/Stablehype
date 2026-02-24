-- Per-pool snapshot data every 10 minutes (30-day retention)
CREATE TABLE IF NOT EXISTS pool_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stablecoin_id TEXT NOT NULL,
  pool_key TEXT NOT NULL,
  project TEXT NOT NULL,
  chain TEXT NOT NULL,
  pool_symbol TEXT NOT NULL,
  pool_type TEXT NOT NULL,
  tvl_usd REAL NOT NULL,
  volume_24h_usd REAL NOT NULL DEFAULT 0,
  balance_ratio REAL,
  fee_tier INTEGER,
  amplification INTEGER,
  effective_tvl REAL,
  pair_quality REAL,
  stress_index REAL,
  organic_fraction REAL,
  snapshot_ts INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pool_snap_dedup
  ON pool_snapshots(pool_key, stablecoin_id, snapshot_ts);

CREATE INDEX IF NOT EXISTS idx_pool_snap_key_ts
  ON pool_snapshots(pool_key, snapshot_ts DESC);

CREATE INDEX IF NOT EXISTS idx_pool_snap_coin_ts
  ON pool_snapshots(stablecoin_id, snapshot_ts DESC);

CREATE INDEX IF NOT EXISTS idx_pool_snap_prune
  ON pool_snapshots(snapshot_ts);


-- Aggregated CEX price per coin every 10 minutes (30-day retention)
CREATE TABLE IF NOT EXISTS cex_price_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stablecoin_id TEXT NOT NULL,
  price_usd REAL NOT NULL,
  top_exchange TEXT NOT NULL,
  top_volume_24h REAL NOT NULL,
  exchange_count INTEGER NOT NULL,
  avg_price REAL NOT NULL,
  snapshot_ts INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cex_hist_dedup
  ON cex_price_history(stablecoin_id, snapshot_ts);

CREATE INDEX IF NOT EXISTS idx_cex_hist_coin_ts
  ON cex_price_history(stablecoin_id, snapshot_ts DESC);

CREATE INDEX IF NOT EXISTS idx_cex_hist_prune
  ON cex_price_history(snapshot_ts);


-- Stable pool metadata registry (updated lazily)
CREATE TABLE IF NOT EXISTS pool_registry (
  pool_key TEXT PRIMARY KEY,
  project TEXT NOT NULL,
  chain TEXT NOT NULL,
  pool_symbol TEXT NOT NULL,
  pool_type TEXT NOT NULL,
  stablecoin_ids_json TEXT NOT NULL,
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  metadata_json TEXT
);
