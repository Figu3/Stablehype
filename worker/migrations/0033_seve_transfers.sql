-- Stablecoin transfers between Sève's Rebalancer Safe and anyone but a Clear reserve or Sève's own
-- Borrower Safe: what it sends to an issuer and what the issuer sends back.
CREATE TABLE seve_transfers (
  tx_hash TEXT NOT NULL,
  log_index INTEGER NOT NULL,
  block_number INTEGER NOT NULL,
  timestamp INTEGER NOT NULL,
  token TEXT NOT NULL,
  direction TEXT NOT NULL,     -- out | in
  counterparty TEXT NOT NULL,
  amount_raw TEXT NOT NULL,
  PRIMARY KEY (tx_hash, log_index)
);
CREATE INDEX idx_seve_transfers_time ON seve_transfers(timestamp);
