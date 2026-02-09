-- JSON blob cache (stablecoin list, logos, per-coin detail data)
CREATE TABLE IF NOT EXISTS cache (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Normalized blacklist events
CREATE TABLE IF NOT EXISTS blacklist_events (
  id TEXT PRIMARY KEY,
  stablecoin TEXT NOT NULL,
  chain_id TEXT NOT NULL,
  chain_name TEXT NOT NULL,
  event_type TEXT NOT NULL,
  address TEXT NOT NULL,
  amount REAL,
  tx_hash TEXT NOT NULL,
  block_number INTEGER NOT NULL,
  timestamp INTEGER NOT NULL,
  explorer_tx_url TEXT NOT NULL,
  explorer_address_url TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_be_timestamp ON blacklist_events(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_be_stablecoin ON blacklist_events(stablecoin);

-- Tracks last-fetched block per chain+contract for incremental blacklist sync
CREATE TABLE IF NOT EXISTS blacklist_sync_state (
  config_key TEXT PRIMARY KEY,
  last_block INTEGER NOT NULL DEFAULT 0
);
