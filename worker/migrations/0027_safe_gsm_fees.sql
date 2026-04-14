-- Track GSM fees paid directly by the Clear team Safe to Aave GHO GSM contracts.
-- These are separate from vault-originated rebalance spread (clear_rebalances);
-- the Safe calls BuyAsset / SellAsset on the GSM to mint or redeem GHO for USDC/USDT,
-- and those events don't appear on the ClearVault LiquidityRebalanceExecuted stream.
--
-- Fee is denominated in GHO (~$1) — we store both raw and the derived fee_usd.
CREATE TABLE IF NOT EXISTS safe_gsm_fees (
  tx_hash         TEXT NOT NULL,
  log_index       INTEGER NOT NULL,
  block_number    INTEGER NOT NULL,
  timestamp       INTEGER NOT NULL,
  date            TEXT NOT NULL,
  gsm_contract    TEXT NOT NULL,
  underlying      TEXT NOT NULL,          -- underlying asset address (USDC or stataUSDT)
  direction       TEXT NOT NULL,          -- 'buy' = pay GHO → get underlying; 'sell' = pay underlying → get GHO
  originator      TEXT NOT NULL,
  receiver        TEXT NOT NULL,
  underlying_amount_raw TEXT NOT NULL,
  gho_amount_raw  TEXT NOT NULL,
  fee_gho_raw     TEXT NOT NULL,
  fee_usd         REAL NOT NULL,
  PRIMARY KEY (tx_hash, log_index)
);

CREATE INDEX IF NOT EXISTS idx_safe_gsm_fees_timestamp ON safe_gsm_fees(timestamp);
CREATE INDEX IF NOT EXISTS idx_safe_gsm_fees_date ON safe_gsm_fees(date);
