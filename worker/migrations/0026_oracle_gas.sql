-- Oracle keeper gas tracking in D1 (replaces fragile client-side RPC scanning)
CREATE TABLE IF NOT EXISTS clear_oracle_txs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tx_hash TEXT NOT NULL,
  block_number INTEGER NOT NULL,
  timestamp INTEGER NOT NULL,
  date TEXT NOT NULL,
  gas_used INTEGER,
  gas_price_gwei REAL,
  gas_cost_eth REAL,
  gas_cost_usd REAL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_clear_oracle_txs_hash ON clear_oracle_txs(tx_hash);
CREATE INDEX IF NOT EXISTS idx_clear_oracle_txs_date ON clear_oracle_txs(date);
