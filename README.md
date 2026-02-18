# Pharos — Stablecoin Analytics Dashboard

Public-facing analytics dashboard tracking 120+ stablecoins across multiple peg currencies, backing types, and governance models. Pure information site — no wallet connectivity, no user accounts.

**Live at [pharos.watch](https://pharos.watch)**

## Features

- **Three-tier classification** — stablecoins categorized as CeFi, CeFi-Dependent, or DeFi based on actual dependency on centralized infrastructure, not marketing claims
- **Multi-peg support** — USD, EUR, GBP, CHF, BRL, RUB, gold-pegged, and CPI-linked stablecoins
- **Peg Tracker** — continuous peg monitoring with a composite Peg Score (0–100) for every tracked stablecoin, depeg event detection, deviation heatmaps, and a historical timeline going back 4 years
- **Freeze & Blacklist Tracker** — real-time on-chain tracking of USDC, USDT, EURC, PAXG, and XAUT freeze/blacklist events across Ethereum, Arbitrum, Base, Optimism, Polygon, Avalanche, BSC, and Tron
- **Stablecoin Cemetery** — 39 dead stablecoins documented with cause of death, peak market cap, and obituaries
- **Detail pages** — price chart, supply history, and chain distribution for each stablecoin
- **Backing type breakdown** — RWA-backed, crypto-backed, and algorithmic
- **Yield-bearing & NAV token filters** — identify tokens that accrue yield natively
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
| [CoinGecko](https://www.coingecko.com/) | Logos, gold-pegged token data (XAUT, PAXG), fallback price enrichment | 6 hours |
| [DexScreener](https://dexscreener.com/) | Best-effort price fallback via on-chain DEX pair data | On demand |
| [Etherscan v2](https://etherscan.io/) | USDC, USDT, EURC, PAXG, XAUT freeze/blacklist events (EVM chains) | 15 min |
| [TronGrid](https://www.trongrid.io/) | USDT freeze events on Tron | 15 min |

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

## Project Structure

```
src/                              Frontend (Next.js static export)
├── app/
│   ├── page.tsx                  Homepage: stats, charts, filters, table
│   ├── peg-tracker/              Peg monitoring: scores, heatmap, timeline
│   ├── blacklist/                Freeze & blacklist event tracker
│   ├── cemetery/                 Dead stablecoin graveyard
│   ├── stablecoin/[id]/          Detail page per stablecoin
│   └── about/                    About & methodology
├── components/                   UI components (table, charts, cards)
├── hooks/                        Data fetching hooks (TanStack Query)
└── lib/                          Types, formatters, peg score, stablecoin master list

worker/                           Cloudflare Worker (API + cron jobs)
├── src/
│   ├── cron/                     Scheduled data sync (DefiLlama, CoinGecko, Etherscan, TronGrid)
│   ├── api/                      REST endpoints
│   └── lib/                      D1 helpers
└── migrations/                   D1 SQL migrations
```

## Infrastructure

```
Cloudflare Worker (API layer)
  ├── Cron: */5 * * * *    → sync stablecoin data from DefiLlama + CoinGecko
  ├── Cron: 0 */6 * * *    → sync logos from CoinGecko
  └── Cron: */15 * * * *   → sync blacklist events from Etherscan/TronGrid

Cloudflare D1 (SQLite database)
  ├── cache                → JSON blobs (stablecoin list, logos, per-coin detail)
  ├── blacklist_events     → normalized freeze/blacklist events
  ├── depeg_events         → peg deviation events with severity tracking
  └── blacklist_sync_state → incremental sync progress per chain+contract

Cloudflare Pages
  └── Static export from Next.js
```

## Deployment

Automated via GitHub Actions (`.github/workflows/deploy-cloudflare.yml`) on push to `main`:

1. **Worker:** `npm ci` → `d1 migrations apply` → `wrangler deploy`
2. **Pages:** `npm ci` → `npm run build` → `wrangler pages deploy out`

Required GitHub secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
Required GitHub variable: `API_BASE_URL`

## License

MIT
