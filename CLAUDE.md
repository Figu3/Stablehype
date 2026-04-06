# StableHype

Public-facing analytics dashboard tracking ~118 stablecoins across multiple peg currencies, backing types, and governance models. Pure information site — no wallet connectivity, no user accounts.

**Live at [stablehype.xyz](https://stablehype.xyz)**

# Development approach

Follow DRY/KISS/YAGNI principles.
When a new data source is added, update the about page to mention it.
After large code changes, especially if structural, check the your claude.md and the readme file, and update if needed.

## Tech Stack

- **Next.js 16** (App Router, deployed to Vercel)
- **React 19** with `use()` for async params
- **TypeScript** (strict mode)
- **Tailwind CSS v4** (PostCSS-based, no tailwind.config — styles in `globals.css`)
- **shadcn/ui** (Radix primitives: table, card, badge, tabs, toggle-group, skeleton, etc.)
- **TanStack Query** (data fetching, caching, polling)
- **Recharts** (area charts, pie charts on detail page)
- **TradingView Lightweight Charts** (price time-series on detail page)
- **next-themes** (dark/light mode)
- **Cloudflare Workers** (API layer — cron-based data fetching + REST endpoints)
- **Cloudflare D1** (SQLite database — caches stablecoin data, blacklist events, depeg events, price history)

## Infrastructure

```
Cloudflare Workers (stablecoin-api)
  ├── Cron: */5 * * * *   → syncStablecoins (DefiLlama + CoinGecko gold) + syncStablecoinCharts
  ├── Cron: */10 * * * *  → syncDexLiquidity (DeFiLlama Yields + Curve API)
  ├── Cron: */15 * * * *  → syncBlacklist (Etherscan/TronGrid/dRPC) + syncUsdsStatus
  └── API endpoints (see below)

Cloudflare D1 (stablecoin-db)
  ├── cache, blacklist_events, blacklist_sync_state
  ├── depeg_events, price_cache
  ├── dex_liquidity, dex_liquidity_history, dex_prices
  └── (see rules/data-integrity.md for sync state semantics)

Vercel (stablecoin-dashboard)
  └── Next.js app (https://stablecoin-dashboard-gilt.vercel.app)
```

**Data flow:** Worker crons fetch from external APIs → store in D1 → Worker API serves from D1 → Browser fetches from Worker API.

**API keys:** `ETHERSCAN_API_KEY`, `TRONGRID_API_KEY`, `DRPC_API_KEY`, and `ADMIN_KEY` are Worker secrets (set via `wrangler secret put`). They are NOT exposed in the frontend bundle.

## Local Development

```bash
# Terminal 1: Worker API
cd worker && npx wrangler dev
# Trigger crons manually: curl "http://localhost:8787/__scheduled?cron=*/5+*+*+*+*"

# Terminal 2: Frontend
NEXT_PUBLIC_API_BASE=http://localhost:8787 npm run dev
```

## Deployment

- **Frontend**: Vercel auto-deploys on push to `main` (connected to GitHub repo)
- **Worker**: `cd worker && npx wrangler deploy` (manual, or via GitHub Actions)
- **D1 migrations**: `cd worker && npx wrangler d1 migrations apply stablecoin-db --remote`

## Data Sources

- **DefiLlama** (`stablecoins.llama.fi`, `coins.llama.fi`) — primary source for supply, price, chain distribution, history
- **CoinGecko** — gold-pegged stablecoin data (XAUT, PAXG), fallback price enrichment
- **DexScreener** — best-effort price fallback (Pass 4) for assets both DefiLlama and CoinGecko miss
- **Etherscan v2** — USDC, USDT, EURC, PAXG, XAUT freeze/blacklist events across EVM chains
- **TronGrid** — USDT freeze/blacklist events on Tron
- **dRPC** — archive RPC for L2 balance lookups at historical block heights
- **Bluechip** (`backend.bluechip.org`) — independent stablecoin safety ratings (SMIDGE framework, 6h refresh)
- **DeFiLlama Yields** (`yields.llama.fi`) — DEX pool TVL, volume, composition for liquidity scoring
- **Curve Finance API** (`api.curve.finance`) — A-factor, balances for quality-adjusted TVL

All external API calls go through the Cloudflare Worker. The frontend never calls external APIs directly. Logos are stored as `data/logos.json`, not fetched at runtime.

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/stablecoins` | Full stablecoin list with supply, price, chains. Returns `X-Data-Updated-At` header |
| `GET /api/stablecoin/:id` | Per-coin detail (cache-aside, 5min TTL) |
| `GET /api/stablecoin-charts` | Historical total supply chart data |
| `GET /api/blacklist` | Freeze/blacklist events (filterable by token, chain) |
| `GET /api/depeg-events` | Depeg events (`?stablecoin=ID`, `?active=true`, `?limit=N&offset=M`) |
| `GET /api/peg-summary` | Per-coin peg scores + aggregate summary stats |
| `GET /api/usds-status` | USDS Sky protocol status |
| `GET /api/bluechip-ratings` | Bluechip safety ratings (keyed by stablecoin ID) |
| `GET /api/dex-liquidity` | DEX liquidity scores, pool data, HHI, trends (keyed by stablecoin ID) |
| `GET /api/dex-liquidity-history` | Per-coin historical liquidity data (`?stablecoin=ID&days=90`) |
| `GET /api/health` | Worker health check |
| `GET /api/backfill-depegs` | Admin: backfill depeg events (requires `X-Admin-Key`) |

## Key Patterns

- **Circulating supply**: Use shared helpers from `src/lib/supply.ts` — `getCirculatingRaw(coin)` for raw sums, `getCirculatingUSD(coin, rates)` for FX-converted totals. For cross-currency totals, always use USD variants with `derivePegRates()`
- **Tailwind class names**: Must be complete static strings — never construct dynamically
- **DefiLlama API quirk**: `/stablecoincharts/all` returns both `totalCirculating` and `totalCirculatingUSD`. Always use `totalCirculatingUSD` for cross-currency comparisons
- **Price guards**: All formatters guard with `typeof price !== "number"` checks. `formatCurrency()` handles negative values (`-$5.00M` not `$-5.00M`) and non-finite values (returns `"N/A"`)
- **BigInt precision**: `decodeUint256()` uses BigInt division to avoid precision loss above 2^53
- **Table sort**: 24h/7d columns sort by **percentage** change, not absolute dollar delta

## Commands

```bash
# Frontend
npm run dev      # Development server
npm run build    # Production build (also runs TypeScript checking)
npm run lint     # ESLint

# Worker
cd worker
npx wrangler dev                   # Local worker dev server
npx wrangler deploy                # Deploy worker to Cloudflare
npx wrangler d1 migrations apply stablecoin-db --local   # Apply migrations locally
npx wrangler d1 migrations apply stablecoin-db --remote  # Apply migrations to prod
npx tsc --noEmit                   # Type-check worker code
```
