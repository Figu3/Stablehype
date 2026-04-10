-- Add gas tracking columns to clear_rebalances
-- Allows tracking keeper gas costs for rebalance transactions alongside oracle costs
ALTER TABLE clear_rebalances ADD COLUMN gas_used INTEGER;
ALTER TABLE clear_rebalances ADD COLUMN gas_price_gwei REAL;
ALTER TABLE clear_rebalances ADD COLUMN gas_cost_eth REAL;
ALTER TABLE clear_rebalances ADD COLUMN gas_cost_usd REAL;
