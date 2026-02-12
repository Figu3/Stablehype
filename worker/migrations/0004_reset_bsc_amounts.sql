-- Reset BSC USDT amounts to NULL so backfill re-fetches with correct decimals (18, not 6).
-- Previous amounts were divided by 10^6 instead of 10^18, making them 10^12x too large.
UPDATE blacklist_events SET amount = NULL WHERE chain_id = 'bsc';
