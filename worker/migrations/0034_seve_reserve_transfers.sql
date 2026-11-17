-- Stablecoin transfers between either of Sève's Safes and a Clear reserve: deposits, withdrawals
-- and the two legs of each rebalance. What Sève put into the reserves is read from these.
CREATE TABLE seve_reserve_transfers (
  tx_hash TEXT NOT NULL,
  log_index INTEGER NOT NULL,
  block_number INTEGER NOT NULL,
  token TEXT NOT NULL,
  direction TEXT NOT NULL,     -- out (Safe to reserve) | in (reserve to Safe)
  amount_raw TEXT NOT NULL,
  PRIMARY KEY (tx_hash, log_index)
);
