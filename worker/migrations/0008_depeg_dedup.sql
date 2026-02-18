-- Deduplicate existing depeg events: keep the row with the worst peak deviation
-- for each (stablecoin_id, started_at, source) group.
DELETE FROM depeg_events
WHERE id NOT IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY stablecoin_id, started_at, source
             ORDER BY ABS(peak_deviation_bps) DESC, id ASC
           ) AS rn
    FROM depeg_events
  )
  WHERE rn = 1
);

-- Unique constraint to prevent future duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_depeg_unique
  ON depeg_events(stablecoin_id, started_at, source);

-- Partial index for fast lookup of open (active) events
CREATE INDEX IF NOT EXISTS idx_depeg_open
  ON depeg_events(stablecoin_id) WHERE ended_at IS NULL;
