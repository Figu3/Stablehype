CREATE TABLE clear_v1_events (
  tx_hash TEXT NOT NULL,
  log_index INTEGER NOT NULL,
  block_number INTEGER NOT NULL,
  timestamp INTEGER NOT NULL,
  date TEXT NOT NULL,
  contract TEXT NOT NULL,      -- lowercase emitter
  kind TEXT NOT NULL,          -- swap | rebalance | flash_loan | deposit | withdraw
                               -- | iou_mint | iou_redeem | pool_swap | pool_liquidity | admin
  event_name TEXT NOT NULL,
  actor TEXT,                  -- event caller or trader
  tx_from TEXT,
  tx_to TEXT,                  -- entry point: aggregator, router, 4337 EntryPoint
  token_in TEXT,
  token_out TEXT,
  amount_in_raw TEXT,
  amount_out_raw TEXT,
  volume_token TEXT,           -- token that volume_units is denominated in (tokenOut)
  volume_units REAL,           -- decimals applied, not priced
  fee_token TEXT,              -- token the fee_* columns are denominated in
  fee_treasury_units REAL,
  fee_lp_units REAL,
  fee_trader_units REAL,
  args_json TEXT,              -- full decoded args
  PRIMARY KEY (tx_hash, log_index)
);
CREATE INDEX idx_clear_v1_events_date ON clear_v1_events(date, kind);
CREATE INDEX idx_clear_v1_events_contract ON clear_v1_events(contract, date);

CREATE TABLE clear_v1_snapshots (
  date TEXT NOT NULL,
  contract TEXT NOT NULL,      -- reserve or pool
  gross_par REAL,              -- NOT summable: Meta gross includes bLP. Use the TVL formula.
  net_par REAL,
  iou_debt_par REAL,
  blp_redemption_price REAL,   -- Base row only
  state_json TEXT,             -- balances, weights, parameters
  PRIMARY KEY (date, contract)
);

CREATE TABLE clear_v1_gas_txs (
  tx_hash TEXT PRIMARY KEY,
  wallet TEXT NOT NULL,
  label TEXT NOT NULL,
  category TEXT NOT NULL,      -- oracle | rebalance | admin | other
  tx_to TEXT,
  block_number INTEGER NOT NULL,
  timestamp INTEGER NOT NULL,
  date TEXT NOT NULL,
  failed INTEGER NOT NULL,
  gas_used INTEGER NOT NULL,
  gas_price_gwei REAL NOT NULL,
  gas_cost_eth REAL NOT NULL,
  value_eth REAL NOT NULL,     -- ETH sent with the tx. 0 on all 23 keeper txs so far.
  gas_cost_usd REAL
);
CREATE INDEX idx_clear_v1_gas_wallet ON clear_v1_gas_txs(wallet, date);
