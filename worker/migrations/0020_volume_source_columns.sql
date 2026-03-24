-- Add transaction sender/target for source classification
ALTER TABLE clear_swaps ADD COLUMN tx_from TEXT;
ALTER TABLE clear_swaps ADD COLUMN tx_to TEXT;

ALTER TABLE clear_rebalances ADD COLUMN tx_from TEXT;
ALTER TABLE clear_rebalances ADD COLUMN tx_to TEXT;

-- Index for efficient source-grouped queries
CREATE INDEX IF NOT EXISTS idx_clear_swaps_tx_to ON clear_swaps(tx_to, date);
CREATE INDEX IF NOT EXISTS idx_clear_swaps_tx_from ON clear_swaps(tx_from, date);
CREATE INDEX IF NOT EXISTS idx_clear_rebalances_tx_from ON clear_rebalances(tx_from, date);
