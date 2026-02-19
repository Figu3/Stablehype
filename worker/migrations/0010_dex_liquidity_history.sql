-- Daily snapshots for liquidity trend tracking
CREATE TABLE IF NOT EXISTS dex_liquidity_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stablecoin_id TEXT NOT NULL,
  total_tvl_usd REAL NOT NULL,
  total_volume_24h_usd REAL NOT NULL DEFAULT 0,
  liquidity_score INTEGER,
  snapshot_date INTEGER NOT NULL  -- UTC midnight epoch seconds
);

CREATE INDEX IF NOT EXISTS idx_dex_hist_coin_date
  ON dex_liquidity_history(stablecoin_id, snapshot_date DESC);

-- HHI concentration metric + depth stability on main liquidity table
ALTER TABLE dex_liquidity ADD COLUMN concentration_hhi REAL;
ALTER TABLE dex_liquidity ADD COLUMN depth_stability REAL;
