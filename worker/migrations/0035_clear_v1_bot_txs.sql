-- What an arb bot kept from one Clear V1 swap tx: the tokens its addresses ended the tx with,
-- read from the receipt's Transfer logs, less gas. One row per bot swap tx.
CREATE TABLE clear_v1_bot_txs (
  tx_hash TEXT PRIMARY KEY,
  bot TEXT NOT NULL,           -- tx_from, lowercase
  block_number INTEGER NOT NULL,
  timestamp INTEGER NOT NULL,
  eth_usd REAL NOT NULL,       -- Chainlink ETH/USD at the tx's block
  gas_eth REAL NOT NULL,
  gross_usd REAL NOT NULL,     -- priced net inflow: WETH at eth_usd, stablecoins and IOUs at $1
  flows_json TEXT NOT NULL,    -- token -> net raw amount, as strings
  unpriced INTEGER NOT NULL    -- tokens in flows_json left out of gross_usd
);
CREATE INDEX idx_clear_v1_bot_txs_bot ON clear_v1_bot_txs(bot);
