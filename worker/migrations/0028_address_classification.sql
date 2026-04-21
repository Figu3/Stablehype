-- Dynamically-discovered swap source classifications for tx.to addresses
-- that aren't in the static SWAP_TO_MAP. Populated by the swap-volume cron
-- via eth_getCode + bytecode pattern match (e.g. EIP-1167 proxies delegating
-- to known MEV implementations). Merged with the static map at API read time.
CREATE TABLE IF NOT EXISTS address_classification (
  address        TEXT PRIMARY KEY,  -- lowercase 0x-prefixed
  source         TEXT NOT NULL,     -- SwapSource label
  detection      TEXT NOT NULL,     -- how it was classified (e.g. "eip1167-mev")
  discovered_at  INTEGER NOT NULL   -- unix seconds
);
