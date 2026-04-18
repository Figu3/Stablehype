# Volume Source Breakdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Break down the daily volume bar chart into stacked segments showing swap sources (KyberSwap, Velora, CowSwap, Direct, Other) and rebalance types (Internal vs External).

**Architecture:** Add `tx_from` and `tx_to` columns to the existing `clear_swaps` and `clear_rebalances` D1 tables. The cron jobs already fetch event logs from Etherscan — extend them to also fetch transaction details (`eth_getTransactionByHash`) for each log, storing the caller/target. Classification happens at query time in the API layer using a known-address map. The frontend chart switches from a single bar to stacked bars when the "Swaps" or "Rebalances" filter is active.

**Tech Stack:** Cloudflare Workers (D1 SQLite), Etherscan v2 API, React/Recharts, TanStack Query

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `worker/migrations/0020_volume_source_columns.sql` | Add `tx_from`, `tx_to` columns + backfill admin endpoint registration |
| Create | `worker/src/lib/clear-address-map.ts` | Canonical address → label mapping for swap sources + rebalance types |
| Modify | `worker/src/cron/sync-swap-volume.ts` | After getLogs, fetch tx details, store `tx_from`/`tx_to` |
| Modify | `worker/src/cron/sync-rebalance-volume.ts` | Same — fetch tx details, store `tx_from`/`tx_to` |
| Modify | `worker/src/api/swap-volume.ts` | Return per-source daily breakdown when requested |
| Modify | `worker/src/api/rebalance-volume.ts` | Return internal/external daily breakdown when requested |
| Create | `worker/src/api/backfill-tx-details.ts` | One-time admin endpoint to backfill `tx_from`/`tx_to` for existing rows |
| Modify | `worker/src/router.ts` | Register backfill endpoint |
| Modify | `src/hooks/use-swap-volume.ts` | Update types to include source breakdown |
| Modify | `src/hooks/use-rebalance-volume.ts` | Update types to include type breakdown |
| Modify | `src/components/clear-protocol/swap-volume-chart.tsx` | Stacked bars by source/type |

---

## Known Address Registry (from on-chain analysis of 40 txs)

**Swap source classification** (by `tx.to`, with CowSwap exception on `tx.from`):

| Label | Addresses | Detection |
|-------|-----------|-----------|
| KyberSwap | `0x6131B5fae19EA4f9D964eAc0408E4408b66337b5` (MetaAggregationRouterV2), `0x958c09b8c862548de60e21eaf4fd0c1d45fd6cae` (executor) | `tx.to` match |
| Velora | `0x6A000F20005980200259B80c5102003040001068` (Augustus v6) | `tx.to` match |
| CowSwap | any | `tx.from` starts with `0xc0ffee` (solver driver pattern) |
| Direct | `0x35e22BcC2c60c8a721cb36cE47ad562860A2D9CB` (Clear Swap) | `tx.to` match |
| Other | everything else | fallback |

**Rebalance type classification** (by `tx.from`):

| Label | Addresses |
|-------|-----------|
| External | `0x9ad88D86c78B5f24fF64e03823AD3e3992b7619D` (Safe), `0xfd86FAEF607A67ED68F7C29042E022196f21DE10` (Agent) |
| Internal | everything else (keeper `0x6ac07769...`, etc.) |

---

### Task 1: DB Migration — Add tx_from and tx_to columns

**Files:**
- Create: `worker/migrations/0020_volume_source_columns.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- Add transaction sender/target for source classification
ALTER TABLE clear_swaps ADD COLUMN tx_from TEXT;
ALTER TABLE clear_swaps ADD COLUMN tx_to TEXT;

ALTER TABLE clear_rebalances ADD COLUMN tx_from TEXT;
ALTER TABLE clear_rebalances ADD COLUMN tx_to TEXT;

-- Index for efficient source-grouped queries
CREATE INDEX IF NOT EXISTS idx_clear_swaps_tx_to ON clear_swaps(tx_to, date);
CREATE INDEX IF NOT EXISTS idx_clear_swaps_tx_from ON clear_swaps(tx_from, date);
CREATE INDEX IF NOT EXISTS idx_clear_rebalances_tx_from ON clear_rebalances(tx_from, date);
```

Note: columns are nullable — existing rows will have `NULL` until backfilled.

- [ ] **Step 2: Apply migration locally**

Run: `cd /Users/figue/Desktop/Vibe\ Coding/Stablecoins/_active/stablehype/worker && npx wrangler d1 migrations apply stablecoin-db --local`
Expected: Migration 0020 applied successfully

- [ ] **Step 3: Commit**

```bash
git add worker/migrations/0020_volume_source_columns.sql
git commit -m "feat: add tx_from/tx_to columns for volume source classification"
```

---

### Task 2: Address Map — Canonical source classification

**Files:**
- Create: `worker/src/lib/clear-address-map.ts`

- [ ] **Step 1: Create the address map module**

```typescript
/**
 * Canonical address → label mapping for Clear Protocol volume source classification.
 * Used by both cron sync (storing tx_from/tx_to) and API layer (grouping by source).
 *
 * Swap sources: classified by tx.to (which contract the user called),
 * except CowSwap which is detected by tx.from prefix.
 *
 * Rebalance types: classified by tx.from (who initiated).
 */

// ── Swap Source Classification ──────────────────────────────────────────────

export type SwapSource = "kyberswap" | "velora" | "cowswap" | "direct" | "other";

/** Map of tx.to address → swap source label */
const SWAP_TO_MAP: Record<string, SwapSource> = {
  // KyberSwap
  "0x6131b5fae19ea4f9d964eac0408e4408b66337b5": "kyberswap", // MetaAggregationRouterV2
  "0x958c09b8c862548de60e21eaf4fd0c1d45fd6cae": "kyberswap", // KyberSwap executor
  // Velora (ParaSwap rebrand)
  "0x6a000f20005980200259b80c5102003040001068": "velora", // Augustus v6
  // Direct (Clear Swap contract)
  "0x35e22bcc2c60c8a721cb36ce47ad562860a2d9cb": "direct", // Clear Swap
};

/** CowSwap solver drivers always have addresses starting with 0xc0ffee */
const COWSWAP_FROM_PREFIX = "0xc0ffee";

export function classifySwapSource(txTo: string, txFrom: string): SwapSource {
  // CowSwap check: solver driver address starts with 0xc0ffee
  if (txFrom.toLowerCase().startsWith(COWSWAP_FROM_PREFIX)) return "cowswap";
  // Known router/aggregator check
  return SWAP_TO_MAP[txTo.toLowerCase()] ?? "other";
}

// ── Rebalance Type Classification ───────────────────────────────────────────

export type RebalanceType = "internal" | "external";

/** Addresses that trigger external rebalances */
const EXTERNAL_REBALANCE_FROM: Set<string> = new Set([
  "0x9ad88d86c78b5f24ff64e03823ad3e3992b7619d", // Clear team Safe
  "0xfd86faef607a67ed68f7c29042e022196f21de10", // External rebalance Agent
]);

export function classifyRebalanceType(txFrom: string): RebalanceType {
  return EXTERNAL_REBALANCE_FROM.has(txFrom.toLowerCase()) ? "external" : "internal";
}

// ── Display labels ──────────────────────────────────────────────────────────

export const SWAP_SOURCE_LABELS: Record<SwapSource, string> = {
  kyberswap: "KyberSwap",
  velora: "Velora",
  cowswap: "CowSwap",
  direct: "Direct",
  other: "Other",
};

export const REBALANCE_TYPE_LABELS: Record<RebalanceType, string> = {
  internal: "Internal",
  external: "External",
};

/** Colors for chart segments (HSL strings matching existing chart palette) */
export const SWAP_SOURCE_COLORS: Record<SwapSource, string> = {
  kyberswap: "hsl(263 70% 58%)",  // violet (primary)
  velora: "hsl(200 70% 50%)",     // blue
  cowswap: "hsl(32 95% 55%)",     // orange
  direct: "hsl(160 60% 45%)",     // emerald
  other: "hsl(240 5% 60%)",       // gray
};

export const REBALANCE_TYPE_COLORS: Record<RebalanceType, string> = {
  internal: "hsl(160 60% 45%)",   // emerald
  external: "hsl(32 95% 55%)",    // orange
};
```

- [ ] **Step 2: Commit**

```bash
git add worker/src/lib/clear-address-map.ts
git commit -m "feat: add address map for swap source and rebalance type classification"
```

---

### Task 3: Cron — Fetch tx details during swap sync

**Files:**
- Modify: `worker/src/cron/sync-swap-volume.ts`

The key change: after fetching event logs, collect unique tx hashes and batch-fetch `eth_getTransactionByHash` for each. Store `tx_from`/`tx_to` in the `clear_swaps` INSERT.

- [ ] **Step 1: Add tx detail fetching helper at top of file**

After the existing `EtherscanLogEntry` interface (line 32), add:

```typescript
interface TxDetail {
  from: string;
  to: string;
}

/**
 * Fetch tx.from and tx.to for a batch of transaction hashes.
 * Uses Etherscan eth_getTransactionByHash proxy (1 call per tx).
 * For ≤50 txs per sync cycle this is fine within the 15-min cron window.
 */
async function fetchTxDetails(
  txHashes: string[],
  etherscanKey: string
): Promise<Map<string, TxDetail>> {
  const details = new Map<string, TxDetail>();
  for (const hash of txHashes) {
    try {
      const url =
        `https://api.etherscan.io/v2/api?chainid=1&module=proxy&action=eth_getTransactionByHash` +
        `&txhash=${hash}&apikey=${etherscanKey}`;
      const resp = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!resp.ok) continue;
      const json = (await resp.json()) as { result?: { from?: string; to?: string } };
      if (json.result?.from) {
        details.set(hash, {
          from: (json.result.from ?? "").toLowerCase(),
          to: (json.result.to ?? "").toLowerCase(),
        });
      }
    } catch {
      console.warn(`[swap-volume] Failed to fetch tx detail for ${hash}`);
    }
  }
  return details;
}
```

- [ ] **Step 2: Call fetchTxDetails and include in INSERT**

In `syncSwapVolume()`, after the `if (logs.length === 0)` guard (line 82), add:

```typescript
  // Fetch tx.from/tx.to for source classification
  const uniqueHashes = [...new Set(logs.map((l) => l.transactionHash))];
  const txDetails = await fetchTxDetails(uniqueHashes, etherscanKey);
  console.log(`[swap-volume] Fetched tx details for ${txDetails.size}/${uniqueHashes.length} txs`);
```

Then modify the INSERT statement in the parsing loop. Replace the existing `INSERT OR IGNORE INTO clear_swaps` block (lines 120-133) with:

```typescript
    const detail = txDetails.get(txHash);
    const txFrom = detail?.from ?? null;
    const txTo = detail?.to ?? null;

    // Per-transaction row (INSERT OR IGNORE to handle re-syncs gracefully)
    txStmts.push(
      db.prepare(
        `INSERT OR IGNORE INTO clear_swaps
         (tx_hash, block_number, timestamp, date, token_in, token_out, receiver,
          amount_in_raw, amount_in_usd, amount_out_raw, amount_out_usd,
          iou_amount_out_raw, iou_treasury_fee_raw, iou_lp_fee_raw,
          tx_from, tx_to)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        txHash, blockNum, ts, date, tokenIn, tokenOut, receiver,
        amountInRaw.toString(), amountInUsd,
        amountOutRaw.toString(), amountOutUsd,
        iouAmountOutRaw.toString(), iouTreasuryFeeRaw.toString(), iouLpFeeRaw.toString(),
        txFrom, txTo
      )
    );
```

- [ ] **Step 3: Run TypeScript check**

Run: `cd /Users/figue/Desktop/Vibe\ Coding/Stablecoins/_active/stablehype/worker && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add worker/src/cron/sync-swap-volume.ts
git commit -m "feat: fetch and store tx_from/tx_to during swap volume sync"
```

---

### Task 4: Cron — Fetch tx details during rebalance sync

**Files:**
- Modify: `worker/src/cron/sync-rebalance-volume.ts`

Same pattern as Task 3 but for rebalances.

- [ ] **Step 1: Add the same fetchTxDetails helper**

After the `EtherscanLogEntry` interface (line 30), add the identical `TxDetail` interface and `fetchTxDetails` function from Task 3 Step 1.

- [ ] **Step 2: Call fetchTxDetails and include in INSERT**

After the `if (logs.length === 0) return;` guard (line 81), add the tx detail fetch:

```typescript
  const uniqueHashes = [...new Set(logs.map((l) => l.transactionHash))];
  const txDetails = await fetchTxDetails(uniqueHashes, etherscanKey);
  console.log(`[rebalance-volume] Fetched tx details for ${txDetails.size}/${uniqueHashes.length} txs`);
```

Replace the INSERT block (lines 108-119) with:

```typescript
    const detail = txDetails.get(txHash);
    const txFrom = detail?.from ?? null;
    const txTo = detail?.to ?? null;

    // Per-transaction row
    txStmts.push(
      db.prepare(
        `INSERT OR IGNORE INTO clear_rebalances
         (tx_hash, block_number, timestamp, date, token_in, token_out,
          amount_in_raw, amount_in_usd, amount_out_raw, amount_out_usd,
          tx_from, tx_to)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        txHash, blockNum, ts, date, tokenIn, tokenOut,
        amountInRaw.toString(), amountInUsd,
        amountOutRaw.toString(), amountOutUsd,
        txFrom, txTo
      )
    );
```

- [ ] **Step 3: Run TypeScript check**

Run: `cd /Users/figue/Desktop/Vibe\ Coding/Stablecoins/_active/stablehype/worker && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add worker/src/cron/sync-rebalance-volume.ts
git commit -m "feat: fetch and store tx_from/tx_to during rebalance volume sync"
```

---

### Task 5: Admin Backfill Endpoint

**Files:**
- Create: `worker/src/api/backfill-tx-details.ts`
- Modify: `worker/src/router.ts`

One-time endpoint to fill `tx_from`/`tx_to` for the ~40 existing rows.

- [ ] **Step 1: Create the backfill handler**

```typescript
/**
 * GET /api/backfill-tx-details
 * One-time admin endpoint: fills tx_from/tx_to for existing clear_swaps + clear_rebalances rows.
 * Requires X-Api-Key header (uses authed() wrapper — same ADMIN_KEY secret).
 */
export async function handleBackfillTxDetails(
  db: D1Database,
  etherscanKey: string | null
): Promise<Response> {
  if (!etherscanKey) {
    return new Response(JSON.stringify({ error: "No ETHERSCAN_API_KEY" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Collect tx hashes with missing tx_from
  const swapRows = await db
    .prepare("SELECT DISTINCT tx_hash FROM clear_swaps WHERE tx_from IS NULL")
    .all<{ tx_hash: string }>();
  const rebalRows = await db
    .prepare("SELECT DISTINCT tx_hash FROM clear_rebalances WHERE tx_from IS NULL")
    .all<{ tx_hash: string }>();

  const allHashes = [
    ...new Set([
      ...(swapRows.results ?? []).map((r) => r.tx_hash),
      ...(rebalRows.results ?? []).map((r) => r.tx_hash),
    ]),
  ];

  if (allHashes.length === 0) {
    return new Response(JSON.stringify({ message: "Nothing to backfill", updated: 0 }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // Fetch tx details
  const details = new Map<string, { from: string; to: string }>();
  for (const hash of allHashes) {
    try {
      const url =
        `https://api.etherscan.io/v2/api?chainid=1&module=proxy&action=eth_getTransactionByHash` +
        `&txhash=${hash}&apikey=${etherscanKey}`;
      const resp = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!resp.ok) continue;
      const json = (await resp.json()) as { result?: { from?: string; to?: string } };
      if (json.result?.from) {
        details.set(hash, {
          from: (json.result.from ?? "").toLowerCase(),
          to: (json.result.to ?? "").toLowerCase(),
        });
      }
    } catch {
      // skip
    }
  }

  // Batch update
  const stmts: D1PreparedStatement[] = [];
  for (const [hash, { from, to }] of details) {
    stmts.push(
      db.prepare("UPDATE clear_swaps SET tx_from = ?, tx_to = ? WHERE tx_hash = ? AND tx_from IS NULL")
        .bind(from, to, hash)
    );
    stmts.push(
      db.prepare("UPDATE clear_rebalances SET tx_from = ?, tx_to = ? WHERE tx_hash = ? AND tx_from IS NULL")
        .bind(from, to, hash)
    );
  }

  if (stmts.length > 0) {
    await db.batch(stmts);
  }

  return new Response(
    JSON.stringify({
      message: "Backfill complete",
      hashesFound: allHashes.length,
      detailsFetched: details.size,
      statementsRun: stmts.length,
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
```

- [ ] **Step 2: Register in router**

In `worker/src/router.ts`, add import at top:

```typescript
import { handleBackfillTxDetails } from "./api/backfill-tx-details";
```

Add route in the `routes` object (after the existing bot routes):

```typescript
  "/api/backfill-tx-details": authed((c) => handleBackfillTxDetails(c.db, c.etherscanKey ?? null)),
```

- [ ] **Step 3: Run TypeScript check**

Run: `cd /Users/figue/Desktop/Vibe\ Coding/Stablecoins/_active/stablehype/worker && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add worker/src/api/backfill-tx-details.ts worker/src/router.ts
git commit -m "feat: add admin endpoint to backfill tx_from/tx_to for existing volume rows"
```

---

### Task 6: API — Swap volume with source breakdown

**Files:**
- Modify: `worker/src/api/swap-volume.ts`

When the client requests source breakdown (via `?breakdown=source`), return per-source volumes per day.

- [ ] **Step 1: Add import and breakdown query**

At the top of `swap-volume.ts`, add:

```typescript
import { classifySwapSource, type SwapSource } from "../lib/clear-address-map";
```

- [ ] **Step 2: Add breakdown logic to handleSwapVolume**

Replace the entire `handleSwapVolume` function with:

```typescript
export async function handleSwapVolume(db: D1Database, url: URL): Promise<Response> {
  try {
    const days = Math.min(Number(url.searchParams.get("days") ?? 90), 365);
    const tokenFilter = url.searchParams.get("token")?.toLowerCase() ?? null;
    const breakdown = url.searchParams.get("breakdown"); // "source" or null

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoff = cutoffDate.toISOString().split("T")[0];

    // When breakdown requested, always query per-transaction table
    if (breakdown === "source") {
      const rows = await db
        .prepare(
          tokenFilter
            ? `SELECT date, tx_from, tx_to, SUM(amount_in_usd) as vol, COUNT(*) as cnt
               FROM clear_swaps
               WHERE date >= ? AND (token_in = ? OR token_out = ?)
               GROUP BY date, tx_from, tx_to ORDER BY date ASC`
            : `SELECT date, tx_from, tx_to, SUM(amount_in_usd) as vol, COUNT(*) as cnt
               FROM clear_swaps
               WHERE date >= ?
               GROUP BY date, tx_from, tx_to ORDER BY date ASC`
        )
        .bind(...(tokenFilter ? [cutoff, tokenFilter, tokenFilter] : [cutoff]))
        .all<{ date: string; tx_from: string | null; tx_to: string | null; vol: number; cnt: number }>();

      // Build per-day, per-source aggregation
      const dayMap = new Map<string, Record<SwapSource, { volumeUSD: number; swapCount: number }>>();
      let totalVolume = 0;
      let totalSwaps = 0;

      for (const row of rows.results ?? []) {
        const source = classifySwapSource(row.tx_to ?? "", row.tx_from ?? "");
        if (!dayMap.has(row.date)) {
          dayMap.set(row.date, {
            kyberswap: { volumeUSD: 0, swapCount: 0 },
            velora: { volumeUSD: 0, swapCount: 0 },
            cowswap: { volumeUSD: 0, swapCount: 0 },
            direct: { volumeUSD: 0, swapCount: 0 },
            other: { volumeUSD: 0, swapCount: 0 },
          });
        }
        const entry = dayMap.get(row.date)![source];
        entry.volumeUSD += row.vol;
        entry.swapCount += row.cnt;
        totalVolume += row.vol;
        totalSwaps += row.cnt;
      }

      // Fill missing days
      const daily: { date: string; sources: Record<SwapSource, { volumeUSD: number; swapCount: number }> }[] = [];
      const now = new Date();
      const emptySources = () => ({
        kyberswap: { volumeUSD: 0, swapCount: 0 },
        velora: { volumeUSD: 0, swapCount: 0 },
        cowswap: { volumeUSD: 0, swapCount: 0 },
        direct: { volumeUSD: 0, swapCount: 0 },
        other: { volumeUSD: 0, swapCount: 0 },
      });

      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const date = d.toISOString().split("T")[0];
        daily.push({ date, sources: dayMap.get(date) ?? emptySources() });
      }

      return new Response(
        JSON.stringify({ volumeUSD: totalVolume, swapCount: totalSwaps, daily }),
        { headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=300" } }
      );
    }

    // Original non-breakdown path (unchanged)
    const dataMap = new Map<string, { volumeUSD: number; swapCount: number }>();
    let totalVolume = 0;
    let totalSwaps = 0;

    if (tokenFilter) {
      const rows = await db
        .prepare(
          `SELECT date, SUM(amount_in_usd) as vol, COUNT(*) as cnt
           FROM clear_swaps
           WHERE date >= ? AND (token_in = ? OR token_out = ?)
           GROUP BY date ORDER BY date ASC`
        )
        .bind(cutoff, tokenFilter, tokenFilter)
        .all<{ date: string; vol: number; cnt: number }>();

      for (const row of rows.results ?? []) {
        dataMap.set(row.date, { volumeUSD: row.vol, swapCount: row.cnt });
        totalVolume += row.vol;
        totalSwaps += row.cnt;
      }
    } else {
      const rows = await db
        .prepare("SELECT date, volume_usd, swap_count FROM swap_volume WHERE date >= ? ORDER BY date ASC")
        .bind(cutoff)
        .all<{ date: string; volume_usd: number; swap_count: number }>();

      for (const row of rows.results ?? []) {
        dataMap.set(row.date, { volumeUSD: row.volume_usd, swapCount: row.swap_count });
        totalVolume += row.volume_usd;
        totalSwaps += row.swap_count;
      }
    }

    const daily: { date: string; volumeUSD: number; swapCount: number }[] = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const date = d.toISOString().split("T")[0];
      const entry = dataMap.get(date);
      daily.push({ date, volumeUSD: entry?.volumeUSD ?? 0, swapCount: entry?.swapCount ?? 0 });
    }

    return new Response(JSON.stringify({ volumeUSD: totalVolume, swapCount: totalSwaps, daily }), {
      headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=300" },
    });
  } catch (err) {
    console.error("[swap-volume] D1 query failed:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
```

- [ ] **Step 3: Run TypeScript check**

Run: `cd /Users/figue/Desktop/Vibe\ Coding/Stablecoins/_active/stablehype/worker && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add worker/src/api/swap-volume.ts
git commit -m "feat: add source breakdown to swap volume API"
```

---

### Task 7: API — Rebalance volume with type breakdown

**Files:**
- Modify: `worker/src/api/rebalance-volume.ts`

Same pattern — when `?breakdown=type`, return internal/external split per day.

- [ ] **Step 1: Add import and breakdown query**

At the top of `rebalance-volume.ts`, add:

```typescript
import { classifyRebalanceType, type RebalanceType } from "../lib/clear-address-map";
```

- [ ] **Step 2: Replace handleRebalanceVolume**

```typescript
export async function handleRebalanceVolume(db: D1Database, url: URL): Promise<Response> {
  try {
    const days = Math.min(Number(url.searchParams.get("days") ?? 90), 365);
    const tokenFilter = url.searchParams.get("token")?.toLowerCase() ?? null;
    const breakdown = url.searchParams.get("breakdown"); // "type" or null

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoff = cutoffDate.toISOString().split("T")[0];

    if (breakdown === "type") {
      const rows = await db
        .prepare(
          tokenFilter
            ? `SELECT date, tx_from, SUM(amount_in_usd) as vol, COUNT(*) as cnt
               FROM clear_rebalances
               WHERE date >= ? AND (token_in = ? OR token_out = ?)
               GROUP BY date, tx_from ORDER BY date ASC`
            : `SELECT date, tx_from, SUM(amount_in_usd) as vol, COUNT(*) as cnt
               FROM clear_rebalances
               WHERE date >= ?
               GROUP BY date, tx_from ORDER BY date ASC`
        )
        .bind(...(tokenFilter ? [cutoff, tokenFilter, tokenFilter] : [cutoff]))
        .all<{ date: string; tx_from: string | null; vol: number; cnt: number }>();

      const dayMap = new Map<string, Record<RebalanceType, { volumeUSD: number; rebalanceCount: number }>>();
      let totalVolume = 0;
      let totalRebalances = 0;

      for (const row of rows.results ?? []) {
        const rType = classifyRebalanceType(row.tx_from ?? "");
        if (!dayMap.has(row.date)) {
          dayMap.set(row.date, {
            internal: { volumeUSD: 0, rebalanceCount: 0 },
            external: { volumeUSD: 0, rebalanceCount: 0 },
          });
        }
        const entry = dayMap.get(row.date)![rType];
        entry.volumeUSD += row.vol;
        entry.rebalanceCount += row.cnt;
        totalVolume += row.vol;
        totalRebalances += row.cnt;
      }

      const daily: { date: string; types: Record<RebalanceType, { volumeUSD: number; rebalanceCount: number }> }[] = [];
      const now = new Date();
      const emptyTypes = () => ({
        internal: { volumeUSD: 0, rebalanceCount: 0 },
        external: { volumeUSD: 0, rebalanceCount: 0 },
      });

      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const date = d.toISOString().split("T")[0];
        daily.push({ date, types: dayMap.get(date) ?? emptyTypes() });
      }

      return new Response(
        JSON.stringify({ volumeUSD: totalVolume, rebalanceCount: totalRebalances, daily }),
        { headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=300" } }
      );
    }

    // Original non-breakdown path (unchanged)
    const dataMap = new Map<string, { volumeUSD: number; rebalanceCount: number }>();
    let totalVolume = 0;
    let totalRebalances = 0;

    if (tokenFilter) {
      const rows = await db
        .prepare(
          `SELECT date, SUM(amount_in_usd) as vol, COUNT(*) as cnt
           FROM clear_rebalances
           WHERE date >= ? AND (token_in = ? OR token_out = ?)
           GROUP BY date ORDER BY date ASC`
        )
        .bind(cutoff, tokenFilter, tokenFilter)
        .all<{ date: string; vol: number; cnt: number }>();

      for (const row of rows.results ?? []) {
        dataMap.set(row.date, { volumeUSD: row.vol, rebalanceCount: row.cnt });
        totalVolume += row.vol;
        totalRebalances += row.cnt;
      }
    } else {
      const rows = await db
        .prepare("SELECT date, volume_usd, rebalance_count FROM rebalance_volume WHERE date >= ? ORDER BY date ASC")
        .bind(cutoff)
        .all<{ date: string; volume_usd: number; rebalance_count: number }>();

      for (const row of rows.results ?? []) {
        dataMap.set(row.date, { volumeUSD: row.volume_usd, rebalanceCount: row.rebalance_count });
        totalVolume += row.volume_usd;
        totalRebalances += row.rebalance_count;
      }
    }

    const daily: { date: string; volumeUSD: number; rebalanceCount: number }[] = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const date = d.toISOString().split("T")[0];
      const entry = dataMap.get(date);
      daily.push({ date, volumeUSD: entry?.volumeUSD ?? 0, rebalanceCount: entry?.rebalanceCount ?? 0 });
    }

    return new Response(JSON.stringify({ volumeUSD: totalVolume, rebalanceCount: totalRebalances, daily }), {
      headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=300" },
    });
  } catch (err) {
    console.error("[rebalance-volume] D1 query failed:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
```

- [ ] **Step 3: Run TypeScript check**

Run: `cd /Users/figue/Desktop/Vibe\ Coding/Stablecoins/_active/stablehype/worker && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add worker/src/api/rebalance-volume.ts
git commit -m "feat: add type breakdown to rebalance volume API"
```

---

### Task 8: Frontend hooks — Update types and fetch breakdown

**Files:**
- Modify: `src/hooks/use-swap-volume.ts`
- Modify: `src/hooks/use-rebalance-volume.ts`

- [ ] **Step 1: Update swap volume hook**

Replace the entire file `src/hooks/use-swap-volume.ts`:

```typescript
"use client";

import { useQuery } from "@tanstack/react-query";
import { API_BASE } from "@/lib/api";

export type SwapSource = "kyberswap" | "velora" | "cowswap" | "direct" | "other";

export interface DailySwapVolume {
  date: string;
  volumeUSD: number;
  swapCount: number;
}

export interface DailySwapVolumeBySource {
  date: string;
  sources: Record<SwapSource, { volumeUSD: number; swapCount: number }>;
}

export interface SwapVolumeData {
  volumeUSD: number;
  swapCount: number;
  daily: DailySwapVolume[];
}

export interface SwapVolumeBySourceData {
  volumeUSD: number;
  swapCount: number;
  daily: DailySwapVolumeBySource[];
}

async function fetchSwapVolume(days: number, token: string | null): Promise<SwapVolumeData> {
  const params = new URLSearchParams({ days: String(days) });
  if (token) params.set("token", token);
  const resp = await fetch(`${API_BASE}/api/swap-volume?${params}`);
  if (!resp.ok) throw new Error(`swap-volume API error: ${resp.status}`);
  return resp.json();
}

async function fetchSwapVolumeBySource(days: number, token: string | null): Promise<SwapVolumeBySourceData> {
  const params = new URLSearchParams({ days: String(days), breakdown: "source" });
  if (token) params.set("token", token);
  const resp = await fetch(`${API_BASE}/api/swap-volume?${params}`);
  if (!resp.ok) throw new Error(`swap-volume API error: ${resp.status}`);
  return resp.json();
}

export function useSwapVolume(days: number = 7, token: string | null = null) {
  return useQuery({
    queryKey: ["clear-swap-volume", days, token],
    queryFn: () => fetchSwapVolume(days, token),
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });
}

export function useSwapVolumeBySource(days: number = 7, token: string | null = null) {
  return useQuery({
    queryKey: ["clear-swap-volume-by-source", days, token],
    queryFn: () => fetchSwapVolumeBySource(days, token),
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });
}
```

- [ ] **Step 2: Update rebalance volume hook**

Replace the entire file `src/hooks/use-rebalance-volume.ts`:

```typescript
"use client";

import { useQuery } from "@tanstack/react-query";
import { API_BASE } from "@/lib/api";

export type RebalanceType = "internal" | "external";

export interface DailyRebalanceVolume {
  date: string;
  volumeUSD: number;
  rebalanceCount: number;
}

export interface DailyRebalanceVolumeByType {
  date: string;
  types: Record<RebalanceType, { volumeUSD: number; rebalanceCount: number }>;
}

export interface RebalanceVolumeData {
  volumeUSD: number;
  rebalanceCount: number;
  daily: DailyRebalanceVolume[];
}

export interface RebalanceVolumeByTypeData {
  volumeUSD: number;
  rebalanceCount: number;
  daily: DailyRebalanceVolumeByType[];
}

async function fetchRebalanceVolume(days: number, token: string | null): Promise<RebalanceVolumeData> {
  const params = new URLSearchParams({ days: String(days) });
  if (token) params.set("token", token);
  const resp = await fetch(`${API_BASE}/api/rebalance-volume?${params}`);
  if (!resp.ok) throw new Error(`rebalance-volume API error: ${resp.status}`);
  return resp.json();
}

async function fetchRebalanceVolumeByType(days: number, token: string | null): Promise<RebalanceVolumeByTypeData> {
  const params = new URLSearchParams({ days: String(days), breakdown: "type" });
  if (token) params.set("token", token);
  const resp = await fetch(`${API_BASE}/api/rebalance-volume?${params}`);
  if (!resp.ok) throw new Error(`rebalance-volume API error: ${resp.status}`);
  return resp.json();
}

export function useRebalanceVolume(days: number = 7, token: string | null = null) {
  return useQuery({
    queryKey: ["clear-rebalance-volume", days, token],
    queryFn: () => fetchRebalanceVolume(days, token),
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });
}

export function useRebalanceVolumeByType(days: number = 7, token: string | null = null) {
  return useQuery({
    queryKey: ["clear-rebalance-volume-by-type", days, token],
    queryFn: () => fetchRebalanceVolumeByType(days, token),
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-swap-volume.ts src/hooks/use-rebalance-volume.ts
git commit -m "feat: add breakdown hooks for swap sources and rebalance types"
```

---

### Task 9: Frontend — Stacked bar chart with source/type breakdown

**Files:**
- Modify: `src/components/clear-protocol/swap-volume-chart.tsx`
- Modify: `src/components/clear-protocol/clear-protocol-panel.tsx`

This is the biggest UI change. When `volumeType === "swap"`, show stacked bars by swap source. When `volumeType === "rebalance"`, show stacked bars by rebalance type. When `volumeType === "all"`, keep the existing single-bar + rebalance% line behavior.

- [ ] **Step 1: Replace swap-volume-chart.tsx**

Replace the entire file with:

```tsx
"use client";

import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { DailySwapVolume } from "@/hooks/use-swap-volume";
import type { DailyRebalanceVolume } from "@/hooks/use-rebalance-volume";
import type { SwapSource, DailySwapVolumeBySource } from "@/hooks/use-swap-volume";
import type { RebalanceType, DailyRebalanceVolumeByType } from "@/hooks/use-rebalance-volume";

export type VolumeRange = 7 | 14 | 30 | 90;
export type VolumeType = "all" | "swap" | "rebalance";

export const TOKEN_FILTERS = [
  { value: null, label: "All" },
  { value: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", label: "USDC" },
  { value: "0xdac17f958d2ee523a2206206994597c13d831ec7", label: "USDT" },
  { value: "0x40d16fc0246ad3160ccc09b8d0d3a2cd28ae6c2f", label: "GHO" },
  { value: "0x4c9edd5852cd905f086c759e8383e09bff1e68b3", label: "USDe" },
  { value: "0xdc035d45d973e3ec169d2276ddab16f1e407384f", label: "USDS" },
] as const;

const TYPE_OPTIONS: { value: VolumeType; label: string }[] = [
  { value: "all", label: "All" },
  { value: "swap", label: "Swaps" },
  { value: "rebalance", label: "Rebalances" },
];

// ── Source/type display config ──────────────────────────────────────────────

// Render order: bottom → top of stack. Last item gets rounded corners.
// "other" at bottom (least important), "kyberswap" on top (most volume).
const SWAP_SOURCES: SwapSource[] = ["other", "cowswap", "velora", "direct", "kyberswap"];

const SWAP_SOURCE_LABELS: Record<SwapSource, string> = {
  kyberswap: "KyberSwap",
  velora: "Velora",
  cowswap: "CowSwap",
  direct: "Direct",
  other: "Other",
};

const SWAP_SOURCE_COLORS: Record<SwapSource, string> = {
  kyberswap: "hsl(263 70% 58%)",
  velora: "hsl(200 70% 50%)",
  cowswap: "hsl(32 95% 55%)",
  direct: "hsl(160 60% 45%)",
  other: "hsl(240 5% 60%)",
};

// "internal" on top (dominant), "external" at bottom
const REBALANCE_TYPES: RebalanceType[] = ["external", "internal"];

const REBALANCE_TYPE_LABELS: Record<RebalanceType, string> = {
  internal: "Internal",
  external: "External",
};

const REBALANCE_TYPE_COLORS: Record<RebalanceType, string> = {
  internal: "hsl(160 60% 45%)",
  external: "hsl(32 95% 55%)",
};

// ── Formatters ──────────────────────────────────────────────────────────────

function formatDateLabel(label: string | number | undefined): string {
  const dateStr = String(label ?? "");
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatUSD(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

const RANGE_OPTIONS: VolumeRange[] = [7, 14, 30, 90];

// ── Props ───────────────────────────────────────────────────────────────────

interface VolumeChartProps {
  swapData: DailySwapVolume[] | undefined;
  rebalanceData: DailyRebalanceVolume[] | undefined;
  swapBySourceData: DailySwapVolumeBySource[] | undefined;
  rebalanceByTypeData: DailyRebalanceVolumeByType[] | undefined;
  range: VolumeRange;
  onRangeChange: (range: VolumeRange) => void;
  tokenFilter: string | null;
  onTokenFilterChange: (token: string | null) => void;
  volumeType: VolumeType;
  onVolumeTypeChange: (type: VolumeType) => void;
}

// ── Chart component ─────────────────────────────────────────────────────────

export function VolumeChart({
  swapData,
  rebalanceData,
  swapBySourceData,
  rebalanceByTypeData,
  range,
  onRangeChange,
  tokenFilter,
  onTokenFilterChange,
  volumeType,
  onVolumeTypeChange,
}: VolumeChartProps) {
  if (!swapData || swapData.length === 0) {
    return (
      <div className="rounded-xl border border-border/40 bg-muted/20 p-4">
        <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
          Loading volume data…
        </div>
      </div>
    );
  }

  // ── Build chart data based on volumeType ──────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let chartData: any[];
  let hasVolume = false;

  if (volumeType === "swap" && swapBySourceData) {
    // Stacked bars by swap source
    chartData = swapBySourceData.map((d) => {
      const row: Record<string, string | number> = { date: d.date };
      for (const src of SWAP_SOURCES) {
        row[src] = d.sources[src]?.volumeUSD ?? 0;
      }
      return row;
    });
    hasVolume = chartData.some((d) =>
      SWAP_SOURCES.some((s) => (d[s] as number) > 0)
    );
  } else if (volumeType === "rebalance" && rebalanceByTypeData) {
    // Stacked bars by rebalance type
    chartData = rebalanceByTypeData.map((d) => {
      const row: Record<string, string | number> = { date: d.date };
      for (const t of REBALANCE_TYPES) {
        row[t] = d.types[t]?.volumeUSD ?? 0;
      }
      return row;
    });
    hasVolume = chartData.some((d) =>
      REBALANCE_TYPES.some((t) => (d[t] as number) > 0)
    );
  } else {
    // "all" mode: single bar (swap + rebalance) with rebalance % line
    const rebalanceMap = new Map<string, number>();
    for (const d of rebalanceData ?? []) {
      rebalanceMap.set(d.date, d.volumeUSD);
    }

    chartData = swapData.map((d) => {
      const swapVol = d.volumeUSD;
      const rebalVol = rebalanceMap.get(d.date) ?? 0;
      const total = swapVol + rebalVol;
      return {
        date: d.date,
        totalVolume: total,
        rebalancePct: total > 0 ? (rebalVol / total) * 100 : 0,
      };
    });
    hasVolume = chartData.some((d) => d.totalVolume > 0);
  }

  // ── Render ────────────────────────────────────────────────────────────

  const showRebalanceLine = volumeType === "all";
  const isSwapBreakdown = volumeType === "swap" && swapBySourceData;
  const isRebalanceBreakdown = volumeType === "rebalance" && rebalanceByTypeData;

  return (
    <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-3">
      {/* Header row: title + range */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Daily Volume ({range}D)
          </h4>
          {showRebalanceLine && (
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-sm bg-violet-500/80" />
                Volume
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-3 h-0.5 rounded bg-emerald-400" />
                Rebalance %
              </span>
            </div>
          )}
        </div>
        <div className="flex gap-1">
          {RANGE_OPTIONS.map((r) => (
            <button
              key={r}
              onClick={() => onRangeChange(r)}
              className={`px-2 py-0.5 text-[10px] font-medium rounded-md transition-colors ${
                range === r
                  ? "bg-violet-500/20 text-violet-400 border border-violet-500/30"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              {r}D
            </button>
          ))}
        </div>
      </div>

      {/* Filter row: type + token */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Type filter */}
        <div className="flex gap-1">
          {TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onVolumeTypeChange(opt.value)}
              className={`px-2 py-0.5 text-[10px] font-medium rounded-md transition-colors ${
                volumeType === opt.value
                  ? "bg-violet-500/20 text-violet-400 border border-violet-500/30"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <span className="text-border/60">|</span>

        {/* Token filter */}
        <div className="flex gap-1 flex-wrap">
          {TOKEN_FILTERS.map((opt) => (
            <button
              key={opt.label}
              onClick={() => onTokenFilterChange(opt.value)}
              className={`px-2 py-0.5 text-[10px] font-medium rounded-md transition-colors ${
                tokenFilter === opt.value
                  ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Legend for breakdown modes */}
      {isSwapBreakdown && (
        <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground">
          {SWAP_SOURCES.map((src) => (
            <span key={src} className="flex items-center gap-1">
              <span
                className="inline-block w-2 h-2 rounded-sm"
                style={{ backgroundColor: SWAP_SOURCE_COLORS[src] }}
              />
              {SWAP_SOURCE_LABELS[src]}
            </span>
          ))}
        </div>
      )}
      {isRebalanceBreakdown && (
        <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground">
          {REBALANCE_TYPES.map((t) => (
            <span key={t} className="flex items-center gap-1">
              <span
                className="inline-block w-2 h-2 rounded-sm"
                style={{ backgroundColor: REBALANCE_TYPE_COLORS[t] }}
              />
              {REBALANCE_TYPE_LABELS[t]}
            </span>
          ))}
        </div>
      )}

      {!hasVolume ? (
        <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
          No activity in the last {range} days
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <ComposedChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
            <XAxis
              dataKey="date"
              tickFormatter={formatShortDate}
              tick={{ fontSize: 10, fill: "#a1a1aa" }}
              axisLine={false}
              tickLine={false}
              interval={range > 14 ? Math.floor(range / 7) - 1 : 0}
            />
            <YAxis
              yAxisId="volume"
              tickFormatter={formatUSD}
              tick={{ fontSize: 10, fill: "#a1a1aa" }}
              axisLine={false}
              tickLine={false}
              width={50}
            />
            {showRebalanceLine && (
              <YAxis
                yAxisId="pct"
                orientation="right"
                domain={[0, 100]}
                tickFormatter={(v: number) => `${v}%`}
                tick={{ fontSize: 10, fill: "#a1a1aa" }}
                axisLine={false}
                tickLine={false}
                width={35}
              />
            )}
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
                fontSize: "12px",
              }}
              labelStyle={{ color: "#e4e4e7" }}
              itemStyle={{ color: "#e4e4e7" }}
              labelFormatter={(label) => formatDateLabel(label as string | number | undefined)}
              formatter={((value: number, name: string) => {
                if (isSwapBreakdown) {
                  const label = SWAP_SOURCE_LABELS[name as SwapSource] ?? name;
                  return [formatUSD(value), label];
                }
                if (isRebalanceBreakdown) {
                  const label = REBALANCE_TYPE_LABELS[name as RebalanceType] ?? name;
                  return [formatUSD(value), label];
                }
                if (name === "totalVolume") return [formatUSD(value), "Total Volume"];
                return [`${value.toFixed(0)}%`, "Rebalanced"];
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              }) as any}
              cursor={{ fill: "rgba(161, 161, 170, 0.1)" }}
            />

            {/* Swap source stacked bars */}
            {isSwapBreakdown &&
              SWAP_SOURCES.map((src, i) => (
                <Bar
                  key={src}
                  yAxisId="volume"
                  dataKey={src}
                  stackId="swap"
                  fill={SWAP_SOURCE_COLORS[src]}
                  opacity={0.85}
                  radius={i === SWAP_SOURCES.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                  maxBarSize={40}
                />
              ))}

            {/* Rebalance type stacked bars */}
            {isRebalanceBreakdown &&
              REBALANCE_TYPES.map((t, i) => (
                <Bar
                  key={t}
                  yAxisId="volume"
                  dataKey={t}
                  stackId="rebalance"
                  fill={REBALANCE_TYPE_COLORS[t]}
                  opacity={0.85}
                  radius={i === REBALANCE_TYPES.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                  maxBarSize={40}
                />
              ))}

            {/* "All" mode: single bar + rebalance% line */}
            {!isSwapBreakdown && !isRebalanceBreakdown && (
              <Bar
                yAxisId="volume"
                dataKey="totalVolume"
                fill="hsl(263 70% 58%)"
                opacity={0.75}
                radius={[4, 4, 0, 0]}
                maxBarSize={40}
              />
            )}
            {showRebalanceLine && (
              <Line
                yAxisId="pct"
                dataKey="rebalancePct"
                stroke="hsl(160 60% 55%)"
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Update clear-protocol-panel.tsx to pass breakdown data**

In `src/components/clear-protocol/clear-protocol-panel.tsx`:

Add imports at top:

```typescript
import { useSwapVolumeBySource } from "@/hooks/use-swap-volume";
import { useRebalanceVolumeByType } from "@/hooks/use-rebalance-volume";
```

After the existing `rebalanceQuery` line (line 32), add:

```typescript
  const swapBySourceQuery = useSwapVolumeBySource(volumeRange, volumeToken);
  const rebalanceByTypeQuery = useRebalanceVolumeByType(volumeRange, volumeToken);
```

Add them to the `isLoading` check (extend around line 88):

```typescript
  const isLoading =
    routesQuery.isLoading || routesQuery.isFetching ||
    keeperQuery.isLoading || keeperQuery.isFetching ||
    vaultQuery.isLoading || vaultQuery.isFetching ||
    swapVolumeQuery.isLoading || swapVolumeQuery.isFetching ||
    rebalanceQuery.isLoading || rebalanceQuery.isFetching ||
    swapBySourceQuery.isLoading || swapBySourceQuery.isFetching ||
    rebalanceByTypeQuery.isLoading || rebalanceByTypeQuery.isFetching;
```

Add to `handleRefreshAll` (after line 99):

```typescript
    queryClient.invalidateQueries({ queryKey: ["clear-swap-volume-by-source"] });
    queryClient.invalidateQueries({ queryKey: ["clear-rebalance-volume-by-type"] });
```

Update the VolumeChart props (around line 221):

```tsx
        <VolumeChart
          swapData={swapVolumeQuery.data?.daily}
          rebalanceData={rebalanceQuery.data?.daily}
          swapBySourceData={swapBySourceQuery.data?.daily}
          rebalanceByTypeData={rebalanceByTypeQuery.data?.daily}
          range={volumeRange}
          onRangeChange={setVolumeRange}
          tokenFilter={volumeToken}
          onTokenFilterChange={setVolumeToken}
          volumeType={volumeType}
          onVolumeTypeChange={setVolumeType}
        />
```

- [ ] **Step 3: Run build to verify everything compiles**

Run: `cd /Users/figue/Desktop/Vibe\ Coding/Stablecoins/_active/stablehype && npm run build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/components/clear-protocol/swap-volume-chart.tsx src/components/clear-protocol/clear-protocol-panel.tsx
git commit -m "feat: stacked bar chart showing swap sources and rebalance types"
```

---

### Task 10: Deploy and Backfill

- [ ] **Step 1: Apply migration to remote D1**

Run: `cd /Users/figue/Desktop/Vibe\ Coding/Stablecoins/_active/stablehype/worker && npx wrangler d1 migrations apply stablecoin-db --remote`
Expected: Migration 0020 applied

- [ ] **Step 2: Deploy worker**

Run: `cd /Users/figue/Desktop/Vibe\ Coding/Stablecoins/_active/stablehype/worker && npx wrangler deploy`
Expected: Worker deployed successfully

- [ ] **Step 3: Run backfill for existing rows**

Run: `curl -X GET "https://<WORKER_URL>/api/backfill-tx-details" -H "X-Api-Key: <ADMIN_KEY>"`
Expected: JSON response with `hashesFound: ~40, detailsFetched: ~40`

- [ ] **Step 4: Verify API returns breakdown data**

Run: `curl -s "https://<WORKER_URL>/api/swap-volume?days=30&breakdown=source" | python3 -m json.tool | head -30`
Expected: JSON with `daily[].sources.kyberswap`, `.direct`, etc.

Run: `curl -s "https://<WORKER_URL>/api/rebalance-volume?days=30&breakdown=type" | python3 -m json.tool | head -30`
Expected: JSON with `daily[].types.internal`, `.external`

- [ ] **Step 5: Deploy frontend**

Push to main triggers the GitHub Actions deploy:

```bash
git push
```

- [ ] **Step 6: Verify on live site**

Open stablehype.xyz, navigate to Clear Protocol section. Click "Swaps" filter — chart should show stacked bars by source (KyberSwap dominant). Click "Rebalances" — should show all-internal bars. Click "All" — should show original single-bar + rebalance% line behavior.
