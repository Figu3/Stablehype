-- Add cumulative deposit tracking to vault snapshots
ALTER TABLE clear_vault_snapshots ADD COLUMN total_deposits_usd REAL DEFAULT 0;
