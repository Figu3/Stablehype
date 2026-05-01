-- Sève bot telemetry events. Append-only.
--
-- Bot pushes events via POST /api/seve/event with HMAC SHA-256 signature
-- of the body using the shared SEVE_HMAC_SECRET (Worker secret). Each
-- event carries a client-generated event_id; INSERT OR IGNORE on that
-- column makes retries idempotent.
--
-- Schema mirrors bot/scripts/migrate.sql in the seve repo. Column types
-- are normalized for D1 (TEXT for big strings, INTEGER for numeric
-- block_number — D1 stores as REAL but block numbers stay below 2^53).

CREATE TABLE IF NOT EXISTS seve_events (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id          TEXT    NOT NULL UNIQUE,         -- client-generated UUID, dedup key
    received_at       INTEGER NOT NULL,                -- worker ingest time, unix seconds
    ts                TEXT    NOT NULL,                -- ISO 8601 UTC, set by the bot
    kind              TEXT    NOT NULL,                -- tick | opportunity | submit | error
    block_number      INTEGER,
    route             TEXT,
    size_usd          REAL,
    abs_depeg_bps_max REAL,
    gross_edge_bps    REAL,
    gas_usd           REAL,
    net_edge_usd      REAL,
    profitable        INTEGER,                          -- 0/1
    simulated_profit  TEXT,                             -- bigint as string
    bundle_hashes     TEXT,                             -- JSON array
    dry_run           INTEGER,                          -- 0/1
    error_message     TEXT
);

CREATE INDEX IF NOT EXISTS idx_seve_events_ts          ON seve_events(ts);
CREATE INDEX IF NOT EXISTS idx_seve_events_kind_ts     ON seve_events(kind, ts);
CREATE INDEX IF NOT EXISTS idx_seve_events_block       ON seve_events(block_number);
CREATE INDEX IF NOT EXISTS idx_seve_events_received_at ON seve_events(received_at);
