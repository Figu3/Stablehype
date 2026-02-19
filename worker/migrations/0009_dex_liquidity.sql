-- Per-stablecoin DEX liquidity snapshot (computed from pool aggregation)
CREATE TABLE IF NOT EXISTS dex_liquidity (
  stablecoin_id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,

  -- Aggregate metrics
  total_tvl_usd REAL NOT NULL DEFAULT 0,
  total_volume_24h_usd REAL NOT NULL DEFAULT 0,
  total_volume_7d_usd REAL NOT NULL DEFAULT 0,
  pool_count INTEGER NOT NULL DEFAULT 0,
  pair_count INTEGER NOT NULL DEFAULT 0,
  chain_count INTEGER NOT NULL DEFAULT 0,

  -- Per-protocol TVL breakdown: {curve: N, "uniswap-v3": N, fluid: N, other: N}
  protocol_tvl_json TEXT,
  -- Per-chain TVL breakdown: {Ethereum: N, Base: N, ...}
  chain_tvl_json TEXT,
  -- Top pools (JSON array, max 10): [{project, chain, tvlUsd, symbol, volumeUsd1d, poolType, extra}]
  top_pools_json TEXT,

  -- Computed composite score (0-100)
  liquidity_score INTEGER,

  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dex_liq_score ON dex_liquidity(liquidity_score DESC);
