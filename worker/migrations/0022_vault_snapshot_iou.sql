-- Add total IOU emitted tracking to vault snapshots for yield computation
-- yield = delta(totalAssets) + delta(emittedIOU) + gsmFees
ALTER TABLE clear_vault_snapshots ADD COLUMN total_iou_emitted_usd REAL DEFAULT 0;
