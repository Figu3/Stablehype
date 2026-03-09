-- Add Ethereum block number to depeg events (Option B: live eth_blockNumber at detection time)
ALTER TABLE depeg_events ADD COLUMN start_block INTEGER;
ALTER TABLE depeg_events ADD COLUMN end_block INTEGER;
