# Stablecoin Dashboard

Public-facing analytics dashboard tracking ~115 stablecoins across multiple peg currencies, backing types, and governance models. Pure information site — no wallet connectivity, no user accounts.

## Tech Stack

- **Next.js 16** (App Router, static export to Cloudflare Pages)
- **React 19** with `use()` for async params
- **TypeScript** (strict mode)
- **Tailwind CSS v4** (PostCSS-based, no tailwind.config — styles in `globals.css`)
- **shadcn/ui** (Radix primitives: table, card, badge, tabs, toggle-group, skeleton, etc.)
- **TanStack Query** (data fetching, caching, polling)
- **Recharts** (area charts, pie charts on detail page)
- **TradingView Lightweight Charts** (price time-series on detail page)
- **next-themes** (dark/light mode)
- **Cloudflare Workers** (API layer — cron-based data fetching + REST endpoints)
- **Cloudflare D1** (SQLite database — caches stablecoin data, logos, blacklist events)

## Infrastructure & Deployment

```
Cloudflare Workers (stablecoin-api)
  ├── Cron: */5 * * * *   → sync stablecoin list from DefiLlama + CoinGecko gold tokens
  ├── Cron: 0 */6 * * *   → sync logos from CoinGecko
  └── Cron: */15 * * * *  → sync blacklist events from Etherscan/TronGrid (incremental)
  └── API endpoints: /api/stablecoins, /api/stablecoin/:id, /api/logos, /api/blacklist

Cloudflare D1 (stablecoin-db)
  ├── cache table         → JSON blobs (stablecoin list, logos, per-coin detail)
  ├── blacklist_events    → normalized blacklist/freeze events
  └── blacklist_sync_state → incremental sync progress per chain+contract

Cloudflare Pages (stablecoin-dashboard)
  └── Static export from Next.js (output: "export")
```

**Data flow:** Worker crons fetch from external APIs → store in D1 → Worker API serves from D1 → Browser fetches from Worker API.

**API keys:** `ETHERSCAN_API_KEY` and `TRONGRID_API_KEY` are Worker secrets (set via `wrangler secret put`). They are NOT exposed in the frontend bundle.

### Local Development

```bash
# Terminal 1: Worker API
cd worker && npx wrangler dev
# Trigger crons manually: curl "http://localhost:8787/__scheduled?cron=*/5+*+*+*+*"

# Terminal 2: Frontend
NEXT_PUBLIC_API_BASE=http://localhost:8787 npm run dev
```

### Deployment

Automated via `.github/workflows/deploy-cloudflare.yml` on push to `main`:
1. Worker: `npm ci` → `d1 migrations apply` → `wrangler deploy`
2. Pages: `npm ci` → `npm run build` (with `NEXT_PUBLIC_API_BASE`) → `wrangler pages deploy out`

GitHub secrets required: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
GitHub variable: `API_BASE_URL` (Worker URL)

### One-time Cloudflare Setup

1. `cd worker && npx wrangler d1 create stablecoin-db` — copy `database_id` into `wrangler.toml`
2. `npx wrangler d1 migrations apply stablecoin-db --remote`
3. `npx wrangler secret put ETHERSCAN_API_KEY`
4. `npx wrangler secret put TRONGRID_API_KEY`
5. `npx wrangler deploy`
6. Create Pages project, set `NEXT_PUBLIC_API_BASE` env var

## Data Sources

- **DefiLlama** (`stablecoins.llama.fi`) — primary source for all stablecoin data (supply, mcap, chains, price, history)
- **CoinGecko** — supplementary: logos, gold-pegged stablecoin data (XAUT, PAXG are not in DefiLlama's stablecoin API)
- **Etherscan v2** — USDC/USDT blacklist events across EVM chains
- **TronGrid** — USDT blacklist events on Tron
- **StableWatch** (`https://www.stablewatch.io/`) — stablecoin and RWA analytics platform; useful as a reference for research and cross-checking data. No public API available as of Jan 2026 (contact: `contact@stablewatch.io`)

All external API calls go through the Cloudflare Worker. The frontend never calls external APIs directly.

## Architecture

```
src/                              # Next.js frontend (static export)
├── app/
│   ├── page.tsx                  # Homepage: stats cards, governance/peg breakdown, filters, table
│   ├── blacklist/page.tsx        # Blacklist/freeze events page
│   └── stablecoin/[id]/          # Detail page: price chart, supply chart, chain distribution
├── components/
│   ├── ui/                       # shadcn/ui primitives (do not edit manually)
│   ├── stablecoin-table.tsx      # Sortable table with filters
│   ├── category-stats.tsx        # Summary cards (total, by type, by backing)
│   ├── governance-chart.tsx      # "Stablecoin by Type" breakdown card
│   ├── peg-type-chart.tsx        # "Alternative Peg Dominance" card
│   ├── price-chart.tsx           # TradingView LW chart (detail page)
│   ├── supply-chart.tsx          # Recharts area chart (detail page)
│   └── chain-distribution.tsx    # Recharts pie chart (detail page)
├── hooks/
│   ├── use-stablecoins.ts        # Fetches from Worker API /api/stablecoins
│   ├── use-logos.ts              # Fetches from Worker API /api/logos
│   └── use-blacklist-events.ts   # Fetches from Worker API /api/blacklist
└── lib/
    ├── api.ts                    # API_BASE URL config (from NEXT_PUBLIC_API_BASE env var)
    ├── types.ts                  # All TypeScript types, filter tag system
    ├── stablecoins.ts            # Master list of ~115 tracked stablecoins with classification flags
    ├── blacklist-contracts.ts    # Contract addresses + event configs (shared with worker)
    ├── format.ts                 # Currency, price, peg deviation, percent change formatters
    ├── peg-rates.ts              # Derives FX reference rates from median prices in data
    └── utils.ts                  # cn() helper for Tailwind class merging

worker/                           # Cloudflare Worker (API + cron jobs)
├── wrangler.toml                 # Worker config, D1 binding, cron triggers
├── migrations/                   # D1 SQL migrations
└── src/
    ├── index.ts                  # Entry: fetch + scheduled handlers, CORS
    ├── router.ts                 # Route matching for API endpoints
    ├── cron/
    │   ├── sync-stablecoins.ts   # DefiLlama + CoinGecko gold → D1 cache
    │   ├── sync-logos.ts         # CoinGecko logos → D1 cache
    │   └── sync-blacklist.ts     # Etherscan/TronGrid → D1 (incremental)
    ├── api/
    │   ├── stablecoins.ts        # GET /api/stablecoins
    │   ├── stablecoin-detail.ts  # GET /api/stablecoin/:id (cache-aside, 5min TTL)
    │   ├── logos.ts              # GET /api/logos
    │   └── blacklist.ts          # GET /api/blacklist
    └── lib/
        └── db.ts                 # D1 read/write helpers
```

## Stablecoin Classification System

Each stablecoin in `src/lib/stablecoins.ts` has flags:

### Type (governance field internally)

Three-tier system reflecting actual dependency on centralized infrastructure:

| Tier | Label | Meaning | Examples |
|------|-------|---------|----------|
| `centralized` | CeFi | Fully centralized issuer, custody, and redemption | USDT, USDC, PYUSD, FDUSD |
| `centralized-dependent` | CeFi-Dep | Decentralized governance/mechanics but depends on centralized custody, off-chain collateral, or centralized exchanges | DAI, USDS, USDe, GHO, FRAX, MIM |
| `decentralized` | DeFi | Fully on-chain collateral, no centralized custody dependency | LUSD, BOLD, crvUSD, sUSD |

The key distinction for `centralized-dependent`: these protocols may have on-chain governance and smart contract mechanics, but they ultimately rely on off-chain t-bill deposits, centralized exchange positions (delta-neutral), or significant USDC/USDT collateral. Calling them "decentralized" would be misleading.

### Backing

| Value | Meaning |
|-------|---------|
| `rwa-backed` | Backed by real-world assets (fiat reserves, treasuries, gold) |
| `crypto-backed` | Backed by on-chain crypto collateral |
| `algorithmic` | Maintains peg via algorithmic mechanisms |

### Peg Currency

`USD`, `EUR`, `GBP`, `CHF`, `BRL`, `RUB`, `GOLD`, `VAR` (variable/CPI-linked), `OTHER`

### Boolean Flags

- `yieldBearing` — token itself accrues yield (e.g., USDY, USDe, BUIDL)
- `rwa` — backed by real-world assets like treasuries/bonds (distinct from `rwa-backed` which also includes plain fiat reserves)

## Non-USD Peg Handling

Peg deviation for non-USD stablecoins requires knowing the USD value of the peg currency. `src/lib/peg-rates.ts` derives this by computing the median price among stablecoins of each `pegType` (from DefiLlama data) with >$1M supply. This avoids hardcoding FX rates. The deviation is then `((price / pegRef) - 1) * 10000` basis points.

## Gold Stablecoins (XAUT, PAXG)

These use synthetic IDs (`gold-xaut`, `gold-paxg`) since they're not in DefiLlama's stablecoin API. Data comes from CoinGecko, shaped into DefiLlama-compatible format by the Worker's `sync-stablecoins` cron, and merged into the `peggedAssets` array before caching.

## Filter System

Filters on the homepage use a multi-group AND logic:
- 4 groups: Peg, Type, Backing, Features
- Single selection per group
- Selections across groups combine with AND
- Defined in `page.tsx` as `FILTER_GROUPS`, tags generated by `getFilterTags()` in `types.ts`

## Key Patterns

- **Circulating supply**: Always computed as `Object.values(coin.circulating).reduce(...)` since DefiLlama returns per-chain breakdown
- **Tailwind class names**: Must be complete static strings — never construct classes dynamically (e.g., `color.replace("text-", "bg-")` won't work because Tailwind purges undetected classes)
- **DefiLlama API quirk**: `/stablecoincharts/all` returns both `totalCirculating` (native currency units) and `totalCirculatingUSD` (USD-converted). Always use `totalCirculatingUSD` for cross-currency comparisons
- **Price guards**: DefiLlama sometimes returns non-number prices. All formatters guard with `typeof price !== "number"` checks
- **Worker imports shared code**: The worker imports `types.ts` and `blacklist-contracts.ts` from `../src/lib/` — wrangler's esbuild resolves these. The root `tsconfig.json` excludes `worker/` to avoid type conflicts with D1 types.

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
