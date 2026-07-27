-- Daily snapshots of the Stablehype Market Index (SMI)
CREATE TABLE IF NOT EXISTS market_index_history (
  date TEXT PRIMARY KEY,          -- YYYY-MM-DD (UTC)
  score INTEGER NOT NULL,
  band TEXT NOT NULL,
  components_json TEXT NOT NULL,  -- MarketIndexComponents + inputs
  updated_at INTEGER NOT NULL
);
