-- Clear reserve shares moved between either of Sève's Safes and an address outside Sève and the
-- reserves (mints, burns and transfers between the two Safes are left out). Sending shares away
-- takes capital out of Sève's LP position, receiving them puts it in. value_json holds what the
-- shares were worth at that block, in stablecoins, read through the reserves: [{token, amount}].
CREATE TABLE seve_share_transfers (
  tx_hash TEXT NOT NULL,
  log_index INTEGER NOT NULL,
  block_number INTEGER NOT NULL,
  reserve TEXT NOT NULL,
  counterparty TEXT NOT NULL,
  direction TEXT NOT NULL,     -- out (Safe sent shares away) | in (Safe received them)
  shares_raw TEXT NOT NULL,
  value_json TEXT NOT NULL,
  PRIMARY KEY (tx_hash, log_index)
);
