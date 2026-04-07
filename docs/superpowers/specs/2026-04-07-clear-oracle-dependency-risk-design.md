# P1.6 — Clear Oracle Dependency Risk Monitor

**Status:** Approved for implementation
**Date:** 2026-04-07
**Scope key:** P1.6 (slim 6-lite, dependency-only)
**Supersedes:** the prior recap's "blacklist-risk + dependency" framing — blacklist is dropped.

## Goal

Ship a per-stablecoin **dependency-risk score** for the 6 Clear oracle stables (USDT, USDC, GHO, USDe, USDS, pyUSD), surfaced as a small card on each detail page. Risk reflects how exposed a coin is to its upstream collateral / mechanism / wrapper / custody dependencies, scored against each dep's own governance and weighted by exposure.

## Non-goals

- Blacklist / freeze risk (explicitly out — user direction)
- Any change to `StablecoinMeta` (the 110+ other stables get nothing)
- Live reserves, on-chain calls, D1 schema changes
- Aggregate Clear-mode dashboard tile (separate session)
- Dependency graph visualization
- Coverage of stablecoins outside the 6-id allowlist

## Approach summary

A pure-config, pure-function port adapted from Pharos's `report-card-dependency.ts`. No D1, no cron, no live data. The worker endpoint computes scores at request time from a hand-curated config; caching is HTTP edge cache only.

## Data model

### `shared/lib/clear-oracle-risk-types.ts`

```ts
export type ClearOracleDepType = "collateral" | "mechanism" | "wrapper" | "custody";

export interface ClearOracleDep {
  upstreamId: string; // either a coin id from the 6, or a sentinel: "offchain-issuer" | "cex-custody" | "fiat-banks"
  label: string;       // human-readable, e.g. "USDC (PSM collateral)"
  weight: number;      // 0..1; sum across deps should be <= 1
  type: ClearOracleDepType;
  note?: string;
}

export interface ClearOracleRiskConfig {
  id: string;          // CoinGecko numeric id, must be in CLEAR_ORACLE_IDS ∪ {"120"}
  governance: "centralized" | "centralized-dependent" | "decentralized";
  dependencies: readonly ClearOracleDep[];
  notes?: string;      // free-text shown in card footer
}

export interface ClearOracleRiskEntry {
  id: string;
  score: number;            // 0..100, integer
  grade: string;            // "A+" | "A" | ... | "F"
  detail: string;           // multi-clause explanation joined with ". "
  selfBackedScore: number;
  resolvedDeps: ReadonlyArray<{
    upstreamId: string;
    label: string;
    weight: number;
    type: ClearOracleDepType;
    score: number;          // the dep's own score (or sentinel score)
    note?: string;
  }>;
}

export interface ClearOracleRiskResponse {
  coins: Record<string, ClearOracleRiskEntry>;
  methodology: { version: string; effectiveAt: string };
  updatedAt: number;
}
```

### `shared/lib/clear-oracle-risk-config.ts`

Six entries keyed by CoinGecko numeric id:

| Id | Symbol | Governance | Dependencies (weight × type) |
|---|---|---|---|
| `"1"` | USDT | centralized | offchain-issuer 0.6 custody, fiat-banks 0.3 custody |
| `"2"` | USDC | centralized | offchain-issuer 0.6 custody, fiat-banks 0.3 custody |
| `"118"` | GHO | decentralized | `"2"` USDC 0.4 mechanism (GSM collateral) |
| `"146"` | USDe | centralized-dependent | cex-custody 0.55 custody, `"1"` USDT 0.15 collateral |
| `"209"` | USDS | decentralized | `"2"` USDC 0.5 mechanism (PSM swap floor) |
| `"120"` | pyUSD | centralized | offchain-issuer 0.6 custody, fiat-banks 0.3 custody |

Sentinel scores (used when `upstreamId` is not one of the 6 ids):
- `offchain-issuer` → 70
- `fiat-banks` → 60
- `cex-custody` → 55

These mirror Pharos's intuition: regulated banks > offchain attestations > opaque CEX custody.

### `shared/lib/clear-oracle-risk-version.ts`

Uses stablehype's `createMethodologyVersion` envelope (the same shape as `depeg-detection-version.ts` — `currentVersion` + `changelogPath` + `changelog[]`). v1.0 effective `2026-04-07`. Single changelog entry summarizing: "Initial release. Dependency-risk scoring for 6 Clear oracle stables. Pure config; no live data."

## Scoring

### `shared/lib/clear-oracle-risk-scoring.ts`

Two pure functions:

```ts
const SELF_BACKED_SCORE_BY_GOVERNANCE = {
  decentralized: 90,
  "centralized-dependent": 75,
  centralized: 95,
} as const;

const SENTINEL_SCORES: Record<string, number> = {
  "offchain-issuer": 70,
  "fiat-banks": 60,
  "cex-custody": 55,
};

export function scoreToGrade(score: number): string { /* 7-line ladder, copy of Pharos */ }

export function scoreClearOracleDependencyRisk(
  config: ClearOracleRiskConfig,
  upstreamScoresById: ReadonlyMap<string, number>,
): ClearOracleRiskEntry { /* see algorithm below */ }
```

**Algorithm** (adapted from Pharos's `report-card-dependency.ts`):

1. `selfBackedScore = SELF_BACKED_SCORE_BY_GOVERNANCE[config.governance]`
2. If `config.dependencies` is empty, return `{score: selfBackedScore, grade, detail: "Self-backed: <gov> (<score>)"}`.
3. Resolve each dep's score: prefer `upstreamScoresById.get(upstreamId)`, fall back to `SENTINEL_SCORES[upstreamId]`. If neither, dep is dropped from the resolved set.
4. If no deps resolved → score = 70, detail = "Upstream dependency scores unavailable".
5. `rawTotal = sum(weights)`; `totalWeight = min(1, rawTotal)`; `selfBackedFraction = 1 - totalWeight`; `normalizer = rawTotal > 1 ? rawTotal : 1`.
6. `blendedScore = sum(depScore × (weight / normalizer)) + selfBackedFraction × selfBackedScore`.
7. **Weak-dep penalty:** if any dep score < 75, `score -= 10`.
8. **Wrapper / mechanism ceiling:** for each dep, compute a ceiling: wrapper → `depScore - 3`, mechanism → `depScore`. Take the min ceiling across all such deps; clamp final score to it.
9. Round, clamp to `[0, 100]`. Grade via `scoreToGrade`.
10. `detail` is a `". "`-joined list of clauses describing: upstream dep count + total weight + blended score, self-backed governance + score, weak-dep penalty (if applied), ceiling (if applied).

This is intentionally a near-verbatim port of Pharos's logic, just typed against our smaller `ClearOracleRiskConfig` instead of `StablecoinMeta`. No `deriveDependencies`, no `reserves` slicing.

## Worker endpoint

### `worker/src/api/clear-oracle-risk.ts`

`GET /api/clear-oracle-risk`:

1. Build the bootstrap pass: score the 3 configs whose deps reference no internal coin ids (USDT, USDC, pyUSD). All deps for these resolve via `SENTINEL_SCORES`, so `upstreamScoresById` can be empty.
2. Build `upstreamScoresById = Map([["1", usdt.score], ["2", usdc.score], ["120", pyusd.score]])`.
3. Score the remaining 3 configs (GHO, USDe, USDS) using that map.
4. Assemble `ClearOracleRiskResponse`. Set `Cache-Control: public, s-maxage=300, max-age=60`. Add `X-Methodology-Version` header.

No D1, no `env.DB`, no error path beyond a 500 if scoring throws. The endpoint is effectively static and could be cached for an hour, but 5 min matches P1.5a.

### `worker/src/router.ts`

Add one route registration line for `"/api/clear-oracle-risk"`.

## Frontend

### `src/hooks/use-clear-oracle-risk.ts`

TanStack Query hook against `/api/clear-oracle-risk`. `staleTime: 5 * 60 * 1000`. Returns `null` on non-200.

### `src/components/clear-oracle-risk-card.tsx`

Slim card built from existing `Card`/`Badge` shadcn primitives. Layout:

- **Header:** "Dependency Risk" + composite score badge (color via inline `scoreClass()` helper, copied from `redemption-backstop-card.tsx`).
- **Self-backed line:** "Self-backed: \<governance label\> (\<selfBackedScore\>)"
- **Dependencies list** (one row per resolved dep): label, weight as `Math.round(weight * 100)%`, type chip, score badge.
- **Detail string** as a small muted paragraph.
- **Methodology version footer:** "Methodology v1.0 · effective 2026-04-07"

Renders nothing if `entry == null`.

### `src/app/stablecoin/[id]/client.tsx`

- Add `useClearOracleRisk()` call near the top of `StablecoinDetailClient` alongside `useRedemptionBackstops()`.
- `clearOracleRiskEntry = clearOracleRiskData?.coins?.[id]`.
- Mount `<ClearOracleRiskCard entry={clearOracleRiskEntry} />` **immediately after `<BluechipRatingCard>`** and **before `<RedemptionBackstopCard>`**. This places it in the natural risk-rating cluster.
- Renders only when `clearOracleRiskEntry` exists (i.e., only on the 6 detail pages).

**Lesson from P1.5a:** define this as inline JSX inside `StablecoinDetailClient`, not as a top-level helper component declared between two existing functions, to avoid the Turbopack stale-chunk trap.

## Tests

### `shared/lib/__tests__/clear-oracle-risk-scoring.test.ts`

Vitest. Cases:

1. **Self-backed only** — config with empty `dependencies[]`, decentralized governance → score 90, grade A.
2. **Pure sentinel deps** — USDT-shaped config (offchain-issuer 0.6, fiat-banks 0.3), centralized governance → blended score around 0.6×70 + 0.3×60 + 0.1×95 ≈ 69.5, weak-dep penalty applies (-10), final ~60.
3. **Internal-id dep blend** — GHO config with USDC at score 88 in `upstreamScoresById` → mechanism ceiling 88, no weak-dep penalty, score reflects 0.4×88 + 0.6×90.
4. **Weak upstream triggers penalty** — GHO with USDC at score 60 → -10 applied.
5. **Wrapper ceiling** — synthetic config with a single wrapper dep at score 80 → final score capped at 77.
6. **Missing upstream score** — config with one internal-id dep, empty `upstreamScoresById`, no sentinel match → resolved.length === 0 → score 70.
7. **Round-trip via `scoreClearOracleDependencyRisk` for all 6 real configs** — sanity-check that all 6 produce a finite integer score in [0, 100] and a valid grade.

No worker integration tests in this scope. The endpoint is thin enough to be exercised manually + via the merge gate's tsc pass.

## File touch map

**New (8):**

1. `shared/lib/clear-oracle-risk-types.ts`
2. `shared/lib/clear-oracle-risk-config.ts`
3. `shared/lib/clear-oracle-risk-scoring.ts`
4. `shared/lib/clear-oracle-risk-version.ts`
5. `worker/src/api/clear-oracle-risk.ts`
6. `src/hooks/use-clear-oracle-risk.ts`
7. `src/components/clear-oracle-risk-card.tsx`
8. `shared/lib/__tests__/clear-oracle-risk-scoring.test.ts`

**Modified (2):**

9. `worker/src/router.ts` — register route
10. `src/app/stablecoin/[id]/client.tsx` — hook + JSX mount

## Verification plan

- Frontend `tsc --noEmit` clean
- Worker `tsc --noEmit` clean (`cd worker && npx tsc --noEmit`)
- `npx vitest run shared/lib/__tests__/clear-oracle-risk-scoring.test.ts` — all cases green
- Manual smoke: hit `/api/clear-oracle-risk` (via `wrangler dev` if local D1 is fresh, or staging) and confirm 6 entries with sane scores
- Visual smoke on a USDC, USDe, and GHO detail page — card renders, scores look plausible (USDC near self-backed centralized, USDe lower due to cex-custody, GHO close to USDC)

## Known constraints / non-issues

- The merge gate currently fails on 3 pre-existing baseline lint errors in `clear-mode-context.tsx`, `clear-protocol/oracle-status.tsx`, `clear-routes.tsx`. **Not in this scope.** Same workaround as P1.5a: ship anyway, flag in commit message.
- Local D1 is stale at session start — detail pages early-return empty `<main>` until `wrangler dev` is run. Visual verification may need to defer to staging.
- Methodology version v1.0 is intentionally minimal — no AI summary integration, no historical scoring, no per-dep drilldown links.
