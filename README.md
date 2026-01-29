# Stablecoin Dashboard

Public-facing analytics dashboard tracking ~115 stablecoins across multiple peg currencies, backing types, and governance models. Pure information site with no wallet connectivity or user accounts.

<!-- TODO: Add screenshot -->

## Features

- **Three-tier classification system** -- stablecoins categorized as CeFi, CeFi-Dependent, or DeFi based on actual dependency on centralized infrastructure
- **Multi-peg support** -- USD, EUR, GBP, CHF, BRL, RUB, gold-pegged, and CPI-linked stablecoins
- **Backing type breakdown** -- RWA-backed, crypto-backed, and algorithmic
- **Yield-bearing filter** -- identify tokens that accrue yield natively
- **Detail pages** -- price chart, supply history, and chain distribution for each stablecoin
- **Dark/light mode**

## Tech Stack

- Next.js 16 (App Router)
- React 19, TypeScript (strict)
- Tailwind CSS v4, shadcn/ui
- TanStack Query, Recharts, TradingView Lightweight Charts

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Other commands

```bash
npm run build    # Production build (includes type-checking)
npm run lint     # ESLint
```

## Data Sources

All data comes from public, unauthenticated APIs -- no keys needed.

- **[DefiLlama](https://defillama.com/)** -- primary source for stablecoin supply, market cap, chains, price, and history
- **[CoinGecko](https://www.coingecko.com/)** -- supplementary data for logos and gold-pegged tokens (XAUT, PAXG) not covered by DefiLlama's stablecoin API

External API calls are proxied through Next.js Route Handlers (`src/app/api/`) for caching and rate-limit management. The client never calls external APIs directly.

## Project Structure

```
src/
  app/
    api/            Route Handlers (API proxy layer)
    page.tsx        Homepage: stats, filters, table
    stablecoin/     Detail pages per stablecoin
  components/       UI components (table, charts, cards)
  hooks/            Data fetching hooks (TanStack Query)
  lib/              Types, formatters, stablecoin master list
```

## License

MIT
