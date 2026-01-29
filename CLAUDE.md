# Stablecoin Dashboard

Public-facing analytics dashboard tracking ~115 stablecoins across multiple peg currencies, backing types, and governance models. Pure information site — no wallet connectivity, no user accounts.

## Tech Stack

- **Next.js 16** (App Router, Route Handlers as API proxy)
- **React 19** with `use()` for async params
- **TypeScript** (strict mode)
- **Tailwind CSS v4** (PostCSS-based, no tailwind.config — styles in `globals.css`)
- **shadcn/ui** (Radix primitives: table, card, badge, tabs, toggle-group, skeleton, etc.)
- **TanStack Query** (data fetching, caching, polling)
- **Recharts** (area charts, pie charts on detail page)
- **TradingView Lightweight Charts** (price time-series on detail page)
- **next-themes** (dark/light mode)

## Data Sources

- **DefiLlama** (`stablecoins.llama.fi`) — primary source for all stablecoin data (supply, mcap, chains, price, history)
- **CoinGecko** — supplementary: logos, gold-pegged stablecoin data (XAUT, PAXG are not in DefiLlama's stablecoin API)

All external API calls go through Next.js Route Handlers in `src/app/api/` to manage caching and rate limits. The client never calls external APIs directly.

## Architecture

```
src/
├── app/
│   ├── api/               # Next.js Route Handlers (API proxy layer)
│   │   ├── stablecoins/   # Proxies DefiLlama /stablecoins and /stablecoin/:id
│   │   ├── coingecko/     # Gold token data (XAUT, PAXG)
│   │   ├── logos/         # Batch logo URLs from CoinGecko
│   │   └── charts/        # Aggregated chart data (currently unused by UI)
│   ├── page.tsx           # Homepage: stats cards, governance/peg breakdown, filters, table
│   └── stablecoin/[id]/   # Detail page: price chart, supply chart, chain distribution
├── components/
│   ├── ui/                # shadcn/ui primitives (do not edit manually)
│   ├── stablecoin-table.tsx    # Sortable table with filters
│   ├── category-stats.tsx      # Summary cards (total, by type, by backing)
│   ├── governance-chart.tsx    # "Stablecoin by Type" breakdown card
│   ├── peg-type-chart.tsx      # "Alternative Peg Dominance" card
│   ├── price-chart.tsx         # TradingView LW chart (detail page)
│   ├── supply-chart.tsx        # Recharts area chart (detail page)
│   └── chain-distribution.tsx  # Recharts pie chart (detail page)
├── hooks/
│   ├── use-stablecoins.ts # Fetches + merges DefiLlama and CoinGecko data
│   └── use-logos.ts       # Logo URL fetching
└── lib/
    ├── types.ts           # All TypeScript types, filter tag system
    ├── stablecoins.ts     # Master list of ~115 tracked stablecoins with classification flags
    ├── format.ts          # Currency, price, peg deviation, percent change formatters
    ├── peg-rates.ts       # Derives FX reference rates from median prices in data
    └── utils.ts           # cn() helper for Tailwind class merging
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

These use synthetic IDs (`gold-xaut`, `gold-paxg`) since they're not in DefiLlama's stablecoin API. Data comes from CoinGecko via `/api/coingecko`, shaped into DefiLlama-compatible format, and merged into `peggedAssets` by the `useStablecoins` hook.

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

## Commands

```bash
npm run dev      # Development server
npm run build    # Production build (also runs TypeScript checking)
npm run lint     # ESLint
```
