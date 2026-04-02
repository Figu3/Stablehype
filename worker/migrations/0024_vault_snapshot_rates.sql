-- Per-token balances and adapter yield rates for rate-based passive yield computation.
-- token_balances_json: [{ "address": "0x...", "balance": 10000.00 }, ...]
-- adapter_rates_json:  [{ "address": "0x...", "apyPct": 2.55 }, ...]
ALTER TABLE clear_vault_snapshots ADD COLUMN token_balances_json TEXT DEFAULT NULL;
ALTER TABLE clear_vault_snapshots ADD COLUMN adapter_rates_json TEXT DEFAULT NULL;
