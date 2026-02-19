-- DEX Liquidity v2: enhanced metrics columns
ALTER TABLE dex_liquidity ADD COLUMN avg_pool_stress REAL;
ALTER TABLE dex_liquidity ADD COLUMN weighted_balance_ratio REAL;
ALTER TABLE dex_liquidity ADD COLUMN organic_fraction REAL;
ALTER TABLE dex_liquidity ADD COLUMN effective_tvl_usd REAL NOT NULL DEFAULT 0;
ALTER TABLE dex_liquidity ADD COLUMN durability_score INTEGER;
ALTER TABLE dex_liquidity ADD COLUMN score_components_json TEXT;
