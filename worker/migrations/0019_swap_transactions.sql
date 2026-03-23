-- Per-transaction swap records for Clear Protocol
-- Enables filtering by token pair, sender, and time range
CREATE TABLE IF NOT EXISTS clear_swaps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tx_hash TEXT NOT NULL,
  block_number INTEGER NOT NULL,
  timestamp INTEGER NOT NULL,          -- unix seconds
  date TEXT NOT NULL,                   -- YYYY-MM-DD for fast daily joins
  token_in TEXT NOT NULL,               -- lowercase address
  token_out TEXT NOT NULL,              -- lowercase address
  receiver TEXT NOT NULL,               -- lowercase address (who got the output)
  amount_in_raw TEXT NOT NULL,          -- raw bigint as string (no precision loss)
  amount_in_usd REAL NOT NULL,          -- USD value of input
  amount_out_raw TEXT NOT NULL,         -- raw bigint as string
  amount_out_usd REAL NOT NULL,         -- USD value of output
  iou_amount_out_raw TEXT,              -- IOU minted (18 dec)
  iou_treasury_fee_raw TEXT,            -- treasury fee in IOU
  iou_lp_fee_raw TEXT,                  -- LP fee in IOU
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Per-transaction rebalance records
CREATE TABLE IF NOT EXISTS clear_rebalances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tx_hash TEXT NOT NULL,
  block_number INTEGER NOT NULL,
  timestamp INTEGER NOT NULL,
  date TEXT NOT NULL,
  token_in TEXT NOT NULL,
  token_out TEXT NOT NULL,
  amount_in_raw TEXT NOT NULL,
  amount_in_usd REAL NOT NULL,
  amount_out_raw TEXT NOT NULL,
  amount_out_usd REAL NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Indexes for common query patterns
CREATE UNIQUE INDEX IF NOT EXISTS idx_clear_swaps_tx ON clear_swaps(tx_hash, token_in, token_out);
CREATE INDEX IF NOT EXISTS idx_clear_swaps_date ON clear_swaps(date);
CREATE INDEX IF NOT EXISTS idx_clear_swaps_token_in ON clear_swaps(token_in, date);
CREATE INDEX IF NOT EXISTS idx_clear_swaps_token_out ON clear_swaps(token_out, date);
CREATE INDEX IF NOT EXISTS idx_clear_swaps_receiver ON clear_swaps(receiver, date);

CREATE UNIQUE INDEX IF NOT EXISTS idx_clear_rebalances_tx ON clear_rebalances(tx_hash, token_in, token_out);
CREATE INDEX IF NOT EXISTS idx_clear_rebalances_date ON clear_rebalances(date);
