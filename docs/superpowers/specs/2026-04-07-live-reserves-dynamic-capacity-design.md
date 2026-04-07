# P1.5b — Live Reserves Dynamic Capacity (slim 3-adapter variant)

**Status:** **DEFERRED** — aborted at implementation-time verification. See "Abort postmortem" at the bottom.
**Date:** 2026-04-07
**Scope key:** P1.5b (dynamic capacity follow-up to P1.5a)
**Supersedes:** the prior recap's "dynamic capacity for 6 assets" framing — reduced to GHO / USDS / USDe after scope flagging, then fully deferred after verification.

## Goal

Replace the static `supply-ratio` capacity model for **GHO, USDS, and USDe** in the redemption-backstop system with live reserve reads pulled by a new cron. GHO and USDS read their on-chain PSM/GSM USDC balance via `eth_call`; USDe reads Ethena's transparency endpoint if one is publicly worker-fetchable at implementation time, otherwise falls back to 2 adapters.

## Non-goals

- USDT, USDC, pyUSD live feeds. They stay on the existing static configs. Issuer-attestation scraping / PDF parsing is deferred to a possible future P1.5c.
- Reserve composition slices (we track a single `capacityUsd` number per coin, not categorized buckets).
- Historical reserve snapshots, chart data, or drilldown UI.
- Admin endpoint for manual capacity override.
- Multi-source aggregation or cross-referencing.
- Pharos's attempt-fencing / freshness envelope / provenance system. Our store is a single-row-per-coin upsert with a status flag.

## Approach summary

One new D1 table, one thin store module, three stateless adapter functions in a new `reserve-adapters/clear/` directory, one cron orchestrator that hangs off the existing `*/15 * * * *` trigger via the existing `tracked()` wrapper, and surgical edits to the redemption-backstops endpoint + configs + methodology version. No new HTTP endpoint — data flows through the existing `GET /api/redemption-backstops`.

## Data model

### `worker/migrations/0025_live_reserves.sql`

```sql
CREATE TABLE live_reserves (
  stablecoin_id   TEXT PRIMARY KEY,
  capacity_usd    REAL,                 -- last known capacity in USD, null until first successful sync
  source_label    TEXT NOT NULL,        -- "Aave GSM USDC", "Sky LitePSM USDC", "Ethena Transparency"
  source_url      TEXT,
  fetched_at      INTEGER NOT NULL,     -- unix seconds of last attempt (success or error)
  status          TEXT NOT NULL,        -- "ok" | "error"
  error           TEXT                  -- null on success, human-readable message on failure
);
```

Single row per stablecoin. On success: upsert all fields. On failure: upsert `status = "error"`, `error = <message>`, `fetched_at = now`, but **leave `capacity_usd` untouched** so the endpoint can keep serving the last known value while the cron retries.

No history table. No per-attempt fencing. No multi-source joins.

### `worker/src/lib/live-reserves-store.ts`

```ts
export interface LiveReservesRow {
  stablecoinId: string;
  capacityUsd: number | null;
  sourceLabel: string;
  sourceUrl: string | null;
  fetchedAt: number;
  status: "ok" | "error";
  error: string | null;
}

export async function readAllLiveReserves(db: D1Database): Promise<Map<string, LiveReservesRow>>;
export async function readLiveReserve(db: D1Database, id: string): Promise<LiveReservesRow | null>;

export async function upsertLiveReserveOk(
  db: D1Database,
  id: string,
  capacityUsd: number,
  sourceLabel: string,
  sourceUrl: string | null,
): Promise<void>;

export async function upsertLiveReserveError(
  db: D1Database,
  id: string,
  sourceLabel: string,
  sourceUrl: string | null,
  error: string,
): Promise<void>;
```

~70 lines total. `upsertLiveReserveError` uses `INSERT ... ON CONFLICT ... DO UPDATE SET status = excluded.status, error = excluded.error, fetched_at = excluded.fetched_at` — **does not touch `capacity_usd`** on conflict, preserving the last-known value.

## Adapters

All three adapters live under `worker/src/cron/reserve-adapters/clear/` and share a single `helpers.ts`.

### `worker/src/cron/reserve-adapters/clear/helpers.ts`

- `ethCall(to: string, data: string, drpcApiKey: string | null): Promise<string>` — raw JSON-RPC via `fetch()` to `https://lb.drpc.org/ogrpc?network=ethereum&dkey=${key}` with public fallback `https://eth.drpc.org`. 12s timeout, 1 retry. Mirrors the pattern already in `sync-swap-volume.ts`.
- `encodeBalanceOf(holder: string): string` — returns `0x70a08231` + 32-byte-padded holder address.
- `decodeUint256(hex: string): bigint` — parses the 66-char hex result.
- `usdc6ToUsd(raw: bigint): number` — divides by 10^6, clamps to safe JS number via `Number()`. Returns 0 on NaN/negative.
- `USDC_MAINNET = "0xA0b86991c6218b3c1d28bA3F16F8b0e4b2C9F8aD"` — constant used by both on-chain adapters.

### `worker/src/cron/reserve-adapters/clear/gho-gsm.ts` (~40 lines)

```ts
const GSM_USDC_FACILITATOR = "0x0d8eFfC11dF3F229AA1EA0509BC9DFa632A13578";

export async function fetchGhoGsm(drpcApiKey: string | null): Promise<AdapterResult> {
  const data = encodeBalanceOf(GSM_USDC_FACILITATOR);
  const hex = await ethCall(USDC_MAINNET, data, drpcApiKey);
  const capacityUsd = usdc6ToUsd(decodeUint256(hex));
  if (capacityUsd <= 0) throw new Error("GHO GSM USDC balance is zero or invalid");
  return {
    capacityUsd,
    sourceLabel: "Aave GSM USDC",
    sourceUrl: `https://etherscan.io/address/${GSM_USDC_FACILITATOR}#readContract`,
  };
}
```

**Contract verification at implementation time**: before committing the address, verify via `cast call 0x0d8eFfC11dF3F229AA1EA0509BC9DFa632A13578` that it's the active GSM USDC facilitator and its USDC balance is nonzero. If the address has drifted or the balance is zero, pause and reassess (don't silently ship a broken adapter).

### `worker/src/cron/reserve-adapters/clear/sky-litepsm.ts` (~40 lines)

```ts
const SKY_LITEPSM_USDC = "0xf6e72Db5454dd049d0788e411b06CfAF16853042";

export async function fetchSkyLitePsm(drpcApiKey: string | null): Promise<AdapterResult> {
  const data = encodeBalanceOf(SKY_LITEPSM_USDC);
  const hex = await ethCall(USDC_MAINNET, data, drpcApiKey);
  const capacityUsd = usdc6ToUsd(decodeUint256(hex));
  if (capacityUsd <= 0) throw new Error("Sky LitePSM USDC balance is zero or invalid");
  return {
    capacityUsd,
    sourceLabel: "Sky LitePSM USDC",
    sourceUrl: `https://etherscan.io/address/${SKY_LITEPSM_USDC}#readContract`,
  };
}
```

Same implementation-time verification requirement as GHO.

### `worker/src/cron/reserve-adapters/clear/ethena-transparency.ts` (~60 lines)

At implementation time, probe Ethena's transparency endpoints to find one that:

1. Returns JSON (not HTML)
2. Is fetchable from a Cloudflare Worker without auth or an API key
3. Exposes a total-backing number I can sum into a `capacityUsd`

Candidate endpoints to try in order:

1. `https://ethena.fi/api/dashboards/transparency/v1/stables`
2. `https://app.ethena.fi/api/dashboards/transparency/backing/breakdown`
3. `https://public.ethena.fi/api/v1/stats` (guess)

**If none work**, this adapter ships in `sync-live-reserves.ts` as a no-op that always throws a single "Ethena transparency endpoint unavailable" error, so:
- The cron records a failure for id `"146"` every run
- The endpoint falls back to USDe's `fallbackRatio: 0.15` config (its current static value)
- The card shows `source: static-fallback` for USDe, identical to the current behavior

In that fallback-only scenario, I will **also** open a follow-up note in the session recap saying "Ethena adapter is a stub; revisit when Ethena publishes a stable public endpoint". The stub still ships so the scaffolding is in place.

If a working endpoint IS found, the adapter sums the backing legs into a single `capacityUsd` and returns `{ capacityUsd, sourceLabel: "Ethena Transparency", sourceUrl: <docs url> }`.

### `worker/src/cron/reserve-adapters/clear/types.ts`

```ts
export interface AdapterResult {
  capacityUsd: number;
  sourceLabel: string;
  sourceUrl: string | null;
}
```

## Cron orchestrator

### `worker/src/cron/sync-live-reserves.ts` (~80 lines)

```ts
export async function syncLiveReserves(
  db: D1Database,
  drpcApiKey: string | null,
): Promise<void> {
  const adapters: AdapterSpec[] = [
    {
      id: "118",
      label: "Aave GSM USDC",
      url: `https://etherscan.io/address/${GSM_USDC_FACILITATOR}#readContract`,
      run: () => fetchGhoGsm(drpcApiKey),
    },
    {
      id: "209",
      label: "Sky LitePSM USDC",
      url: `https://etherscan.io/address/${SKY_LITEPSM_USDC}#readContract`,
      run: () => fetchSkyLitePsm(drpcApiKey),
    },
    {
      id: "146",
      label: "Ethena Transparency",
      url: "https://ethena.fi/dashboards/transparency",
      run: () => fetchEthenaTransparency(),
    },
  ];

  for (const adapter of adapters) {
    try {
      const res = await adapter.run();
      await upsertLiveReserveOk(db, adapter.id, res.capacityUsd, res.sourceLabel, res.sourceUrl);
    } catch (err) {
      await upsertLiveReserveError(db, adapter.id, adapter.label, adapter.url, String(err));
    }
  }
}
```

Sequential execution (not parallel) to:

- Stay comfortably under Cloudflare Worker subrequest limits
- Be polite to dRPC / Ethena
- Make failure isolation easier to reason about — one bad adapter doesn't cascade

Total expected runtime: < 3 seconds for 2 eth_calls + 1 HTTP fetch.

## Scheduled handler hook

### `worker/src/index.ts`

Extend the existing `case "*/15 * * * *":` block — this cron already runs blacklist, usds-status, and bluechip syncs — by adding:

```ts
ctx.waitUntil(
  tracked("sync-live-reserves", () => syncLiveReserves(env.DB, env.DRPC_API_KEY ?? null)),
);
```

No new cron trigger, no `wrangler.toml` change. The `tracked()` wrapper already writes success/failure rows to the `cron_health` table, which `handleHealth()` reads.

## Endpoint integration

### `worker/src/api/redemption-backstops.ts`

1. **Imports**: add `readAllLiveReserves` from the new store.
2. **At the top of `handleRedemptionBackstops`**, after reading the stablecoins cache, read live reserves once: `const liveReservesById = await readAllLiveReserves(db)`.
3. **Rename** `resolveStaticCapacity` → `resolveCapacity` and extend its signature:

```ts
interface ResolvedCapacity {
  immediateCapacityUsd: number | null;
  immediateCapacityRatio: number | null;
  sourceMode: "static" | "live" | "static-fallback";
  sourceLabel: string | null;
  sourceUrl: string | null;
}

function resolveCapacity(
  model: RedemptionCapacityModel,
  circulatingUsd: number,
  liveReserve: LiveReservesRow | null,
): ResolvedCapacity
```

Algorithm:
- `supply-full` → unchanged, `sourceMode: "static"`
- `supply-ratio` → unchanged, `sourceMode: "static"`
- `reserve-sync-metadata`:
  - If `liveReserve?.status === "ok"` and `liveReserve.capacityUsd != null`:
    - `capacityUsd = min(liveReserve.capacityUsd, circulatingUsd)` (clamp — never claim more capacity than supply)
    - `sourceMode: "live"`, `sourceLabel` and `sourceUrl` from the row
  - Else if `typeof model.fallbackRatio === "number"`:
    - `capacityUsd = circulatingUsd * model.fallbackRatio`, `sourceMode: "static-fallback"`, labels null
  - Else:
    - `capacityUsd: null`, `sourceMode: "static-fallback"`, labels null

4. **`buildEntry` propagation**: the returned `RedemptionBackstopEntry` already has a `sourceMode` field (currently always `"static"`). Just plumb the new value through. The frontend card footer already renders `source: {sourceMode}` — no UI change needed.

5. **`entry.docs`**: if `sourceMode === "live"`, prepend `{ label: res.sourceLabel, url: res.sourceUrl }` to the docs list so the user can click through to the on-chain source.

## Config updates

### `shared/lib/redemption-backstop-configs/index.ts`

Flip three entries:

```ts
// GHO
"118": {
  ...psmSwapBase,
  capacityModel: {
    kind: "reserve-sync-metadata",
    basis: "psm-balance-share",
    fallbackRatio: 0.25, // preserves P1.5a behavior when live data is unavailable
  },
  costModel: fixedFee(20, "GHO Stability Module facilitator fee."),
  notes: ["Redemption via the GSM (GHO Stability Module) against USDC. Live GSM balance used for capacity when available."],
},

// USDS
"209": {
  ...psmSwapBase,
  capacityModel: {
    kind: "reserve-sync-metadata",
    basis: "psm-balance-share",
    fallbackRatio: /* whatever psmSwapBase currently uses */,
  },
  notes: ["Permissionless 1:1 conversion to/from DAI via the Sky upgrade module. Live LitePSM USDC balance used for capacity when available."],
},

// USDe
"146": {
  ...queueRedeemBase,
  accessModel: "whitelisted-onchain",
  settlementModel: "same-day",
  capacityModel: {
    kind: "reserve-sync-metadata",
    basis: "hot-buffer",
    fallbackRatio: 0.15, // preserves P1.5a behavior
  },
  notes: ["Whitelisted permissionless mint/redeem; cooldown applies to retail unstaking. Live Ethena transparency backing used for capacity when available."],
},
```

The `RedemptionCapacityModel` union already supports `kind: "reserve-sync-metadata"` with an optional `fallbackRatio` (verified in P1.5a). **USDT, USDC, pyUSD configs are not touched.**

## Methodology version bump

### `shared/lib/redemption-backstop-version.ts`

Prepend a new v1.1 entry to the `changelog` array and change `currentVersion` to `"1.1"`:

```ts
{
  version: "1.1",
  title: "Dynamic capacity for GHO, USDS, USDe",
  date: "2026-04-07",
  effectiveAt: Date.UTC(2026, 3, 7) / 1000,
  summary:
    "Live on-chain reserve reads for GHO (Aave GSM) and USDS (Sky LitePSM) via dRPC eth_call. " +
    "Off-chain reserve feed for USDe (Ethena transparency) with graceful fallback to static when unavailable. " +
    "USDT, USDC, pyUSD remain on static configs.",
  impact: [
    "GHO capacity now reflects real-time GSM USDC balance instead of a 25% supply ratio",
    "USDS capacity now reflects real-time LitePSM USDC balance instead of the psmSwapBase ratio",
    "USDe capacity now reflects Ethena transparency backing totals when the feed is healthy",
    "All dynamic capacities are clamped to circulating USD to prevent over-reporting",
    "Stale / errored live data falls back to the configured static ratio",
  ],
  commits: [],
  reconstructed: false,
},
```

Keep the v1.0 entry as the second array element (chronological sorting is handled by `methodology-version.ts`).

## Health surfacing

### `worker/src/api/health.ts`

Add `"sync-live-reserves"` to whatever list of cron job names the health endpoint reports on. Piggybacks on the existing `cron_health` table — no migration needed.

## Tests

### `worker/src/lib/__tests__/live-reserves-store.test.ts`

Vitest. Uses an in-memory D1 mock (or the existing store test pattern in the repo):

1. `upsertLiveReserveOk` → `readLiveReserve` returns the inserted row
2. `upsertLiveReserveOk` then `upsertLiveReserveError` → row preserves `capacity_usd`, sets `status = "error"`, sets `error`
3. `upsertLiveReserveOk` twice → second upsert overwrites all fields
4. `readAllLiveReserves` returns a Map keyed by `stablecoinId`
5. `readLiveReserve` returns `null` for unknown id

### `worker/src/cron/reserve-adapters/clear/__tests__/decoder.test.ts`

Pure unit tests for `helpers.ts`:

1. `encodeBalanceOf` produces the expected 68-char hex for a known address
2. `decodeUint256` parses `0x0...5f5e100` → `100000000n`
3. `usdc6ToUsd(100_000_000n)` → `100`
4. `usdc6ToUsd(0n)` → `0`

No network calls. No mocking. Vitest may be broken in this env (P1.6 hit an ERR_REQUIRE_ESM on the config loader); if so, inline node-based sanity check as before.

### `worker/src/api/__tests__/redemption-backstops-capacity.test.ts`

Test `resolveCapacity` in isolation (pure function):

1. `supply-full` → returns `circulating` regardless of live row (even if present)
2. `supply-ratio 0.25` → returns `circulating * 0.25`
3. `reserve-sync-metadata` with `status=ok, capacityUsd=1e9`, circulating `2e9` → returns `1e9`, `sourceMode: "live"`
4. `reserve-sync-metadata` with `status=ok, capacityUsd=3e9`, circulating `2e9` → returns `2e9` (clamped), `sourceMode: "live"`
5. `reserve-sync-metadata` with `status=error, fallbackRatio=0.15`, circulating `2e9` → returns `3e8`, `sourceMode: "static-fallback"`
6. `reserve-sync-metadata` with no row at all, `fallbackRatio=0.25` → returns `circulating * 0.25`, `sourceMode: "static-fallback"`
7. `reserve-sync-metadata` with no row and no fallbackRatio → returns `null`, `sourceMode: "static-fallback"`

## File touch map

**New (9):**

1. `worker/migrations/0025_live_reserves.sql`
2. `worker/src/lib/live-reserves-store.ts`
3. `worker/src/cron/reserve-adapters/clear/helpers.ts`
4. `worker/src/cron/reserve-adapters/clear/types.ts`
5. `worker/src/cron/reserve-adapters/clear/gho-gsm.ts`
6. `worker/src/cron/reserve-adapters/clear/sky-litepsm.ts`
7. `worker/src/cron/reserve-adapters/clear/ethena-transparency.ts`
8. `worker/src/cron/sync-live-reserves.ts`
9. `worker/src/cron/reserve-adapters/clear/__tests__/decoder.test.ts`

Plus whichever of these fit the repo's existing test layout:

10. `worker/src/lib/__tests__/live-reserves-store.test.ts`
11. `worker/src/api/__tests__/redemption-backstops-capacity.test.ts`

**Modified (4):**

12. `worker/src/index.ts` (scheduled handler — add one `ctx.waitUntil` line)
13. `worker/src/api/redemption-backstops.ts` (resolveCapacity + live-reserve lookup)
14. `shared/lib/redemption-backstop-configs/index.ts` (flip 3 configs)
15. `shared/lib/redemption-backstop-version.ts` (v1.1 entry)
16. `worker/src/api/health.ts` (register the new cron name)

**Total: ~14 files** (hard count, no scope creep).

## Verification plan

1. Frontend `tsc --noEmit`: clean
2. Worker `tsc --noEmit`: clean
3. `npx wrangler d1 migrations apply stablecoin-db --local` — new migration applies cleanly
4. `wrangler dev` locally + manual cron trigger: `curl "http://localhost:8787/__scheduled?cron=*/15+*+*+*+*"` — logs show 3 adapters running, at least 2 succeed
5. `SELECT * FROM live_reserves` (via `wrangler d1 execute`) — GHO and USDS rows with `status = "ok"`, nonzero `capacity_usd`
6. Sanity check GHO capacity against `cast call 0xA0b86991c6218b3c1d28bA3F16F8b0e4b2C9F8aD "balanceOf(address)(uint256)" 0x0d8eFfC11dF3F229AA1EA0509BC9DFa632A13578 --rpc-url https://eth.drpc.org` and divide by 10^6 — should match the cron's value
7. `curl http://localhost:8787/api/redemption-backstops | jq '.coins["118"].sourceMode'` → `"live"`, `immediateCapacityUsd` matches the D1 value
8. Visual verification: detail pages for GHO, USDS show `source: live` in the redemption-backstop card footer and plausible immediate capacity. USDT, USDC, pyUSD still show `source: static`.
9. Ethena branch: either `source: live` with a plausible value, or `source: static-fallback` (if the probe failed). Both are acceptable — the fallback is the safety net.

## Known risks + mitigations

1. **Ethena endpoint schema drift or block** — adapter fails gracefully, USDe falls back to 0.15 static ratio. Identical to current behavior. Ship anyway.
2. **dRPC rate limits** — 2 `eth_call`s every 15 min is ~192 calls/day. Well under free-tier quotas. Public `https://eth.drpc.org` is an unauthenticated fallback.
3. **Contract address drift** (Aave migrates GSM, Sky migrates LitePSM) — hardcoded constants with etherscan URLs. If the balance reads zero or the adapter errors for >24h, the frontend falls back to the static ratio automatically. I will **manually verify via `cast call`** that both addresses are live and nonzero before committing.
4. **Clamping to circulating** — if a buggy read returns a value larger than circulating supply, we clamp. Prevents a decimal error from displaying "$100 trillion capacity" on the card.
5. **Stale data** — the store preserves `capacity_usd` on error, so a brief RPC outage doesn't zero out the card. After ~1 day of sustained failures, the value gets visibly old. We don't currently warn the user about that staleness — acceptable for v1.1; could add a freshness chip in a future iteration.
6. **Merge gate** — pre-existing baseline lint errors were **fixed in `c4f0ff8`** (the commit right before this spec is implemented), so the gate should be clean.

## Out of scope (explicit reminder)

- USDT, USDC, pyUSD live capacity
- Reserve composition slices / pie charts
- Historical reserve snapshots
- Admin override endpoint
- Multi-source aggregation
- Full Pharos adapter library port
- Pharos's `LiveReservesConfig` field on `StablecoinMeta` (shape stays unchanged)

---

## Abort postmortem (2026-04-07)

This spec was **aborted at implementation-time verification**, before any code was written. Pre-implementation `cast call` probes revealed that every "simple on-chain read" in the spec was wrong in a way that would have required porting Pharos's full adapter logic — not the slim 30-line-per-adapter version the spec assumed.

### What verification turned up

| Spec assumption | Actual reality |
|---|---|
| GHO capacity = `USDC.balanceOf(GSM)`, 1 eth_call, ~30 lines | GHO token has **6 facilitators** (verified on mainnet). Real protocol headroom needs enumerating `getFacilitatorsList()` then decoding a per-facilitator bucket tuple that does NOT parse with standard `(uint128,uint128,string)` ABI. Pharos's `gho.ts` adapter is **536 lines** of custom decoding, registry iteration, and warning aggregation. A simple balanceOf would report $0 — verified. |
| USDS capacity = `USDC.balanceOf(LitePSM)`, 1 eth_call, ~30 lines | Pharos's `sky-makercore.ts` (167 lines) does **not** read on-chain at all. It fetches Block Analitica's off-chain groups API and parses module-level debt/collateral. The LitePSM address in the spec (`0xf6e72Db5454dd049d0788e411b06CfAF16853042`) returned zero USDC balance on live mainnet. Either stale or inactive. |
| Ethena transparency = `fetch()` a public JSON endpoint, ~60 lines | Not probed. Based on the GHO and USDS findings, there is strong prior that Ethena will also be harder than the spec assumed. |

### Pattern recognition

This was the **third scope reassessment** of P1.5b in a single conversation (12 files → 25 files → 3 adapters → 0 working adapters). That pattern is itself the signal: every layer of the stack revealed more complexity, not less, which means the phase is priced wrong at a fundamental level and not at the margins.

The user's standing preference (from the prior session recap) was explicit: *"honest scope flagging worked well — saved a multi-session rabbit hole."* The same heuristic applies here — aborting before writing code is cheaper than shipping half of a broken adapter set and then having to back it out.

### What stays shipped

- **P1.5a static layer** (`d2ca3c2`): redemption backstop scoring + card for 10 stablecoins. Already live. USDT/USDC/GHO/USDe/USDS/pyUSD use `supply-full` or `supply-ratio` static models that are defensible approximations.
- **P1.6** (`90cd813`): Clear oracle dependency risk monitor.
- **Baseline lint fixes** (`c4f0ff8`): merge gate unblocked.

None of the above depended on P1.5b.

### What's deferred

Dynamic live-capacity reads for **any** stablecoin. Revisit only if:

1. A dedicated multi-session effort is budgeted to port Pharos's `live-reserves-store` + at least `gho.ts` and one off-chain adapter faithfully, OR
2. A lighter alternative data source materializes (e.g., DefiLlama adds a per-stablecoin "headroom" field, or a public aggregator API emerges), OR
3. The static ratios in `redemption-backstop-configs/index.ts` become demonstrably misleading in a way the UI needs to correct.

Until then, the card's `sourceMode: "static"` is correct and honest.

### Recommended next work

From the still-pending list in the prior session recap:

- **P1.1** DEWS pipeline
- **P1.3** Mint/burn flows
- **P1.7** CSI (Clear Stability Index)
- **P2.1** Discovery scanner

Any of these are independent of live reserves and can be brainstormed + shipped in one session.
