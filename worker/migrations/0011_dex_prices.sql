-- DEX-implied prices extracted from Curve StableSwap pools
-- Used for cross-validation of primary (DefiLlama) prices in depeg detection
CREATE TABLE IF NOT EXISTS dex_prices (
  stablecoin_id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  dex_price_usd REAL NOT NULL,
  source_pool_count INTEGER NOT NULL,
  source_total_tvl REAL NOT NULL,
  deviation_from_primary_bps INTEGER,
  primary_price_at_calc REAL,
  price_sources_json TEXT,
  updated_at INTEGER NOT NULL
);
