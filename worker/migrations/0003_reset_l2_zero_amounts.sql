-- Reset events with amount=0 on L2 chains (Arbitrum, Polygon, Base) back to NULL.
-- Etherscan v2 eth_call with historical block tags returns 0 on L2s when archive
-- state isn't available, producing false-0 balances. This includes destroy events
-- which were excluded from the previous migration (0002).
UPDATE blacklist_events
SET amount = NULL
WHERE amount = 0
  AND chain_id IN ('arbitrum', 'polygon', 'base');
