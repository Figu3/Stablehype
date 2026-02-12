-- Reset Polygon USDT sync state so it re-scans from block 0 with the newly
-- added USDT0 event topics (BlockPlaced, BlockReleased, DestroyedBlockedFunds).
-- The contract was upgraded in-place from bridged USDT to USDT0.
-- INSERT OR IGNORE ensures existing events are not duplicated.
DELETE FROM blacklist_sync_state WHERE config_key = 'polygon-0xc2132d05d31c914a87c6611c10748aeb04b58e8f';
