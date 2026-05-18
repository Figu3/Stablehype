/**
 * Sève bot telemetry endpoints.
 *
 *   POST /api/seve/event    — bot ingest (HMAC-authed, batch insert)
 *   GET  /api/seve/recent   — public: last N events, filterable by kind
 *   GET  /api/seve/stats    — public: aggregates for the Sève dashboard tab
 *   GET  /api/seve/arb-gap  — public: latest arb-gap per pair + 24h history
 *
 * Schema: see migrations/0030_seve_events.sql.
 *
 * `arb_gap` events: one per evaluated pair per block. The bot writes the
 * pair label into `route` (e.g. "GHO-USDC"), the best gross-bps across both
 * flows into `gross_edge_bps`, the winning size into `size_usd`, and
 * "{adapter}|{flow}" into `error_message`. No schema migration needed.
 */

import { verifyHmacHex } from "../lib/hmac";

type SeveEventKind =
  | "tick"
  | "opportunity"
  | "submit"
  | "reject"
  | "error"
  | "inclusion"
  | "arb_gap";

interface SeveEvent {
  event_id: string;     // client-generated UUID; dedup key
  ts: string;           // ISO 8601 UTC
  kind: SeveEventKind;
  block_number?: number | string | null; // bigint stringified
  route?: string | null;
  size_usd?: number | null;
  abs_depeg_bps_max?: number | null;
  gross_edge_bps?: number | null;
  gas_usd?: number | null;
  net_edge_usd?: number | null;
  profitable?: boolean | null;
  simulated_profit?: string | null;
  bundle_hashes?: string[] | null;
  dry_run?: boolean | null;
  error_message?: string | null;
}

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });

export async function handleSeveIngest(
  request: Request | undefined,
  db: D1Database,
  secret: string | undefined,
): Promise<Response> {
  if (!request) return json({ error: "no request" }, { status: 400 });
  if (!secret)  return json({ error: "ingest disabled" }, { status: 503 });

  const body = await request.text();
  const sig  = request.headers.get("X-Seve-Signature");
  const ok   = await verifyHmacHex(body, sig, secret);
  if (!ok) return json({ error: "bad signature" }, { status: 401 });

  let payload: { events?: SeveEvent[] };
  try { payload = JSON.parse(body); }
  catch { return json({ error: "bad json" }, { status: 400 }); }

  const events = payload.events ?? [];
  if (!Array.isArray(events) || events.length === 0) {
    return json({ ok: true, inserted: 0 });
  }
  if (events.length > 1000) {
    return json({ error: "too many events (max 1000)" }, { status: 413 });
  }

  const now = Math.floor(Date.now() / 1000);
  const stmts = events
    .filter((e) => e && e.event_id && e.ts && e.kind)
    .map((e) =>
      db.prepare(
        `INSERT OR IGNORE INTO seve_events
           (event_id, received_at, ts, kind, block_number, route,
            size_usd, abs_depeg_bps_max, gross_edge_bps, gas_usd, net_edge_usd,
            profitable, simulated_profit, bundle_hashes, dry_run, error_message)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        e.event_id,
        now,
        e.ts,
        e.kind,
        e.block_number !== undefined && e.block_number !== null
          ? Number(e.block_number)
          : null,
        e.route ?? null,
        e.size_usd ?? null,
        e.abs_depeg_bps_max ?? null,
        e.gross_edge_bps ?? null,
        e.gas_usd ?? null,
        e.net_edge_usd ?? null,
        e.profitable === undefined || e.profitable === null
          ? null
          : e.profitable ? 1 : 0,
        e.simulated_profit ?? null,
        e.bundle_hashes ? JSON.stringify(e.bundle_hashes) : null,
        e.dry_run === undefined || e.dry_run === null
          ? null
          : e.dry_run ? 1 : 0,
        e.error_message ?? null,
      )
    );

  if (stmts.length === 0) return json({ ok: true, inserted: 0 });

  // D1 batch is transactional. INSERT OR IGNORE makes retries idempotent.
  const results = await db.batch(stmts);
  const inserted = results.reduce((sum, r) => sum + (r.meta?.changes ?? 0), 0);
  return json({ ok: true, inserted, received: events.length });
}

export async function handleSeveRecent(db: D1Database, url: URL): Promise<Response> {
  const limitRaw = parseInt(url.searchParams.get("limit") ?? "200", 10);
  const limit    = Math.min(Math.max(limitRaw || 200, 1), 1000);
  const kind     = url.searchParams.get("kind");

  const rows = kind
    ? await db
        .prepare(
          `SELECT id, event_id, ts, kind, block_number, route, size_usd,
                  abs_depeg_bps_max, gross_edge_bps, gas_usd, net_edge_usd,
                  profitable, simulated_profit, bundle_hashes, dry_run, error_message
           FROM seve_events
           WHERE kind = ?
           ORDER BY id DESC
           LIMIT ?`,
        )
        .bind(kind, limit)
        .all()
    : await db
        .prepare(
          `SELECT id, event_id, ts, kind, block_number, route, size_usd,
                  abs_depeg_bps_max, gross_edge_bps, gas_usd, net_edge_usd,
                  profitable, simulated_profit, bundle_hashes, dry_run, error_message
           FROM seve_events
           ORDER BY id DESC
           LIMIT ?`,
        )
        .bind(limit)
        .all();

  return json({ events: rows.results ?? [] }, {
    headers: { "Cache-Control": "public, max-age=10" },
  });
}

export async function handleSeveStats(db: D1Database): Promise<Response> {
  // Counts per kind over the last 24h, plus all-time.
  const dayAgo  = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const counts  = await db
    .prepare(
      `SELECT kind, COUNT(*) AS n_24h
       FROM seve_events
       WHERE ts >= ?
       GROUP BY kind`,
    )
    .bind(dayAgo)
    .all();

  const allTime = await db
    .prepare(`SELECT kind, COUNT(*) AS n FROM seve_events GROUP BY kind`)
    .all();

  // Submission summary: dry-run vs live, total simulated profit.
  const submits = await db
    .prepare(
      `SELECT
         SUM(CASE WHEN dry_run = 1 THEN 1 ELSE 0 END) AS dry_run_submits,
         SUM(CASE WHEN dry_run = 0 THEN 1 ELSE 0 END) AS live_submits,
         COUNT(*) AS total_submits
       FROM seve_events
       WHERE kind = 'submit'`,
    )
    .first<{ dry_run_submits: number; live_submits: number; total_submits: number }>();

  // Profitable opportunity rate.
  const opps = await db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN profitable = 1 THEN 1 ELSE 0 END) AS profitable
       FROM seve_events
       WHERE kind = 'opportunity'`,
    )
    .first<{ total: number; profitable: number }>();

  // Latest tick to surface "is the bot alive?".
  const latestTick = await db
    .prepare(
      `SELECT ts, block_number, abs_depeg_bps_max
       FROM seve_events
       WHERE kind = 'tick'
       ORDER BY id DESC
       LIMIT 1`,
    )
    .first<{ ts: string; block_number: number; abs_depeg_bps_max: number }>();

  return json(
    {
      countsByKind24h: counts.results ?? [],
      countsByKindAllTime: allTime.results ?? [],
      submits,
      opportunities: opps,
      latestTick,
    },
    { headers: { "Cache-Control": "public, max-age=10" } },
  );
}

/**
 * GET /api/seve/arb-gap
 *
 * Returns the latest `arb_gap` event per pair (currently fireable arb
 * surface), plus a 24h history sparkline.
 *
 * Response shape:
 *   {
 *     latestByPair: [
 *       { pair, bestGrossEdgeBps, bestAdapter, bestFlow, bestSizeUsd, ts, blockNumber },
 *       ...
 *     ],
 *     history: [
 *       { pair, bucket_minute, gross_edge_bps },   // 5-min buckets, max-gross per bucket
 *       ...
 *     ],
 *   }
 *
 * Interpretation: `bestGrossEdgeBps > 0` means the arb gap exceeds the DEX
 * leg's round-trip cost at the chosen size — fireable. `≤ 0` means the gap
 * is being eaten by fees + slippage. The dashboard colors accordingly.
 *
 * Query params:
 *   ?window=24h    (default; also accepts "1h", "6h", "7d")
 */
export async function handleSeveArbGap(db: D1Database, url: URL): Promise<Response> {
  const window = url.searchParams.get("window") ?? "24h";
  const hours = ({ "1h": 1, "6h": 6, "24h": 24, "7d": 168 } as Record<string, number>)[window] ?? 24;
  const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();

  // Latest arb_gap per pair. Window the GROUP BY by `route` (= pair) and
  // pick the row with the max ts. D1's SQLite supports correlated
  // subqueries; cheaper than a window function for ~10 distinct pairs.
  const latestByPair = await db
    .prepare(
      `SELECT
         route                AS pair,
         gross_edge_bps       AS bestGrossEdgeBps,
         size_usd             AS bestSizeUsd,
         error_message        AS adapter_flow,
         ts,
         block_number         AS blockNumber
       FROM seve_events
       WHERE kind = 'arb_gap'
         AND id IN (
           SELECT MAX(id) FROM seve_events WHERE kind = 'arb_gap' GROUP BY route
         )
       ORDER BY gross_edge_bps DESC`,
    )
    .all<{
      pair: string;
      bestGrossEdgeBps: number;
      bestSizeUsd: number;
      adapter_flow: string | null;
      ts: string;
      blockNumber: number;
    }>();

  // Unpack the "adapter|flow" label the bot encoded.
  const latestRows = (latestByPair.results ?? []).map((r) => {
    const [bestAdapter, bestFlow] = (r.adapter_flow ?? "|").split("|");
    return {
      pair: r.pair,
      bestGrossEdgeBps: r.bestGrossEdgeBps,
      bestAdapter: bestAdapter || null,
      bestFlow: bestFlow || null,
      bestSizeUsd: r.bestSizeUsd,
      ts: r.ts,
      blockNumber: r.blockNumber,
    };
  });

  // 5-minute buckets of MAX gross-edge per pair over the window. Max is
  // the right reduction here: it surfaces transient fireable windows the
  // bot saw, even if subsequent ticks closed the gap.
  // strftime trims to minute precision then INTEGER-divides by 5.
  const history = await db
    .prepare(
      `SELECT
         route AS pair,
         strftime('%Y-%m-%dT%H:%M:00Z',
           datetime(strftime('%s', ts) / 300 * 300, 'unixepoch')
         ) AS bucket_minute,
         MAX(gross_edge_bps) AS gross_edge_bps
       FROM seve_events
       WHERE kind = 'arb_gap' AND ts >= ?
       GROUP BY pair, bucket_minute
       ORDER BY bucket_minute ASC`,
    )
    .bind(since)
    .all<{ pair: string; bucket_minute: string; gross_edge_bps: number }>();

  return json(
    {
      latestByPair: latestRows,
      history: history.results ?? [],
      window,
    },
    { headers: { "Cache-Control": "public, max-age=10" } },
  );
}
