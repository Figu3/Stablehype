# StableHype — Stablecoin Analytics Dashboard

Public-facing analytics dashboard tracking 120+ stablecoins across multiple peg currencies, backing types, and governance models. Pure information site — no wallet connectivity, no user accounts.

**Live at [stablehype.xyz](https://stablehype.xyz)**

## Features

- **Three-tier classification** — stablecoins categorized as CeFi, CeFi-Dependent, or DeFi based on actual dependency on centralized infrastructure, not marketing claims
- **Multi-peg support** — USD, EUR, GBP, CHF, BRL, RUB, gold-pegged, and CPI-linked stablecoins with cross-currency FX-adjusted totals
- **Peg Tracker** — continuous peg monitoring with a composite Peg Score (0–100) for every tracked stablecoin, depeg event detection with direction tracking, deviation heatmaps, and a historical timeline going back 4 years
- **Freeze & Blacklist Tracker** — real-time on-chain tracking of USDC, USDT, EURC, PAXG, and XAUT freeze/blacklist events across Ethereum, Arbitrum, Base, Optimism, Polygon, Avalanche, BSC, and Tron with BigInt-precision amounts
- **Stablecoin Cemetery** — 62 dead stablecoins documented with cause of death, peak market cap, and obituaries
- **Detail pages** — price chart, supply history, and chain distribution for each stablecoin
- **Backing type breakdown** — RWA-backed, crypto-backed, and algorithmic
- **Yield-bearing & NAV token filters** — identify tokens that accrue yield natively
- **Research-grade data pipeline** — structural validation, supply sanity checks, concurrent write protection, depeg deduplication, and price validation guardrails
- **Dark/light mode**

## Tech Stack

- **Frontend:** Next.js 16 (App Router, static export), React 19, TypeScript (strict)
- **Styling:** Tailwind CSS v4, shadcn/ui (Radix primitives)
- **Charts:** TanStack Query, Recharts, TradingView Lightweight Charts
- **API:** Cloudflare Worker (cron-based data fetching + REST endpoints)
- **Database:** Cloudflare D1 (SQLite — caches stablecoin data, logos, blacklist events, depeg events)
- **Hosting:** Cloudflare Pages

## Data Sources

All external API calls go through the Cloudflare Worker. The frontend never calls external APIs directly.

| Source | Purpose | Refresh |
|--------|---------|---------|
| [DefiLlama](https://defillama.com/) | Stablecoin supply, price, chain distribution, history | 5 min |
| [CoinGecko](https://www.coingecko.com/) | Gold-pegged token data (XAUT, PAXG), fallback price enrichment | 5 min (as fallback) |
| [DexScreener](https://dexscreener.com/) | Best-effort price fallback via on-chain DEX pair data | On demand |
| [Etherscan v2](https://etherscan.io/) | USDC, USDT, EURC, PAXG, XAUT freeze/blacklist events (EVM chains) | 15 min |
| [TronGrid](https://www.trongrid.io/) | USDT freeze events on Tron | 15 min |
| [dRPC](https://drpc.org/) | Archive RPC for L2 balance lookups at historical block heights | 15 min |

## Getting Started

### Frontend

```bash
npm install
NEXT_PUBLIC_API_BASE=http://localhost:8787 npm run dev
```

### Worker API

```bash
cd worker
npx wrangler dev
```

To trigger crons manually:

```bash
npx wrangler dev --remote --test-scheduled
curl "http://localhost:8787/__scheduled?cron=*/5+*+*+*+*"
```

### Other commands

```bash
npm run build    # Production build (includes type-checking)
npm run lint     # ESLint
cd worker && npx tsc --noEmit   # Type-check worker
```

## License

MIT
