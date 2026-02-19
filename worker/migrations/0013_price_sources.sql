-- Multi-source price data: DEX pools, on-chain oracles, CEX exchanges
-- Used for price comparison visualization on stablecoin detail pages
CREATE TABLE IF NOT EXISTS price_sources (
  stablecoin_id TEXT NOT NULL,
  source_category TEXT NOT NULL,     -- 'dex', 'oracle', 'cex'
  source_name TEXT NOT NULL,         -- 'curve', 'uniswap-v3', 'chainlink', 'binance', etc.
  price_usd REAL NOT NULL,
  confidence REAL,                   -- 0-1 (TVL-based for DEX, volume for CEX, 1.0 for oracle)
  extra_json TEXT,                   -- {chain, tvl, pair, feedAddress, volume24h, ...}
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (stablecoin_id, source_category, source_name)
);
CREATE INDEX IF NOT EXISTS idx_price_sources_coin ON price_sources(stablecoin_id);
