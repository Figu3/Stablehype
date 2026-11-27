# StableHype

Public-facing analytics dashboard tracking ~414 stablecoins (full DefiLlama universe: hand-curated core + auto-classified extended registry) across multiple peg currencies, backing types, and governance models. Pure information site — no wallet connectivity, no user accounts.

**Live at [stablehype.com](https://stablehype.com)**

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

**Two sites, one codebase:** the investor page (stablehype.com) and the control center (stablehype.vercel.app) are two Vercel projects on this repo. `IS_CONTROL_SITE` in `src/lib/site-mode.ts` reads `NEXT_PUBLIC_SITE_MODE`: the control center sets it to `control`, and anything else, including no value, builds the investor page, so a missing flag never shows control-center content. The investor page has the homepage without tabs (summary, reserves, routes) and the Terminal; its nav is Dashboard and Terminal. Its Activity block has no MM fees tile or chart (`METRICS` in `daily-chart.tsx`): what the market maker earns is shown on the control center only. The control center adds the homepage tabs (`control-tabs.tsx`), the Arb and Sève nav links, the keeper gas page and `/status/`, and is `noindex`. A page that only the control center serves is named `page.control.tsx`: `pageExtensions` in `next.config.ts` picks it up in the control build alone, so it 404s on the investor page. Run `npm run dev:control` or `npm run build:control` for the control center; CI builds both. The split is presentation only: the Worker API and the Vercel URL are public.

**Frontend pages:** the frontend is Clear-only (the general dashboard, the Clear mode toggle and `/depegs/`, `/flows/`, `/compare/` were removed in Nov 2026; the Worker still collects and serves that data). `/` (Clear V1 panel), `/routes/` (Terminal), `/arb/` (Arb: one row per bot address from `/api/clear-v1-arb`, with what the bot kept and what the protocol and the rebalancer made on its swaps), `/seve/` (control center only, in the nav; the same `SeveSection` is the "Sève" tab of the homepage: three blocks: capital for rebalancing from `/api/seve-capital`, the loop over a period picked with a 24h/7d/30d/90d filter (swaps on Clear from `/api/seve-rebalances`, then USDG minted with USDT and burnt for USDC from `/api/seve-conversions`), and profit and loss after Wildcat interest from `/api/seve-carry` plus the conversion gain and the liquidity provider gain from `/api/seve-lp`. Figures are in USDT, the loan's currency: holdings are repriced with Stablehype prices (`SEVE_PRICE_IDS`). A rebalance is not a loss to LPs: both legs trade at redemption value, and Sève's gain comes from converting what it receives 1:1 with the issuer), `/stablecoin/[id]/`, `/methodology/` + `/methodology/[slug]/` (versioned methodology + changelogs from `shared/lib/*-version.ts`), `/status/` (data freshness from `/api/health`). Global ⌘K command palette (`src/components/command-palette.tsx`, cmdk).

**Clear V1 indexer:** separate from the v0.2 Clear tables, which stay as history. `sync-clear-v1-events` (`*/5`) scans all V1 emitters into `clear_v1_events`; `sync-clear-v1-state` (`*/15`) does one Multicall3 read into the `clear-v1-state` cache row and upserts `clear_v1_snapshots`; `sync-clear-v1-gas` (`*/15`) records watched EOAs into `clear_v1_gas_txs` by bisecting their nonce over RouteMesh, with no Etherscan call. Addresses and the gas watchlist live in `shared/lib/clear-v1-config.ts`, the hand-verified seed. **Self-discovery** (`worker/src/lib/clear-v1-registry.ts`) adds to it at runtime, stored in cache row `clear-v1-registry` and merged by `mergeRegistry()` (static wins on a clash): the events cron turns a factory `NewClearReserve` log for an unknown Meta reserve into a reserve, its two IOUs and a feed, scanning them from the creation block in the same tick; it polls the Curve factory's `pool_count` each tick and adopts a pool once both coins are known tokens. Emitters found after the cursor passed their lower bound get a backfill job, drained one 5,000-block chunk per tick. A new Base reserve type is not auto-described and stays in `unknownReserves`. A static emitter added after the cursor passed its first log goes in `V1_LATE_EMITTERS`: the events cron queues its past once (`lateDone` in the registry row). The ClearAlphaFeeRouter is one: its `AlphaFeeCharged` logs are kind `alpha_fee`, the aggregator's fee in the maker asset, shown on the homepage as "Aggregator fees collected" and never counted as Clear revenue. The API returns the merged `tokens` map so the UI can label discovered tokens. **Routes** are stablecoin to stablecoin (`spotRoutes()` in `sync-clear-v1-state.ts`): Base assets swap on Base; any other pair meets at bLP, entering or leaving through the native's Meta swap (`isRouteOpen`) or Base single-asset deposit/withdraw (`previewDepositSingleAsset`/`previewWithdrawSingleAsset`, which revert when the basket is off its redemption price). A route is open only if every hop is. **Quotes** (`worker/src/lib/clear-v1-quotes.ts`) are the source of truth for what trades: every spot route is quoted at 10,000 units of its input by chaining the reserves' own previews (`previewSwap`, `previewDepositSingleAsset`, `previewWithdrawSingleAsset`) in two Multicall3 reads, the first step's output feeding the second. Replays at the block before real trades 0x63af9dcc and 0xddb5fa07 matched to the unit. Do not trust `isRouteOpen` for this: Meta PYUSD answered true while `previewSwap` reverted `DepegQuoteBelowPar` (2026-11-09). A revert is named (`OffRedemptionPrice` = Base's gate, which fires when ANY Base asset is more than `redemptionProximityBps` from its redemption price; `QuoteUnavailable`; `DepegQuoteBelowPar`). The panel (`routes-panel.tsx`) lets you pick a source and lists each destination with the amount out, rate, the rate against the oracle cross-rate in bps, and how it is priced (depeg route or redemption price) or why it does not quote. Unlike the v0.2 syncs, these throw on any failure before moving a cursor, so `cron_health` is truthful. Figures are at par. **Reserve APR** (`reserveLpApr7d`): the headline is share price growth from the day before the 7-day window to the latest snapshot, annualised (Base at `blp_redemption_price`, a Meta at `net_par / supply`); the fee APR (swap + flash LP fees over average net value) is shown under it, and the difference is deposit/withdrawal pricing and rebalances. A proportional `Deposit` has no fee field: the depositor mints at the reserve's price, and the gap to redemption value goes to existing LPs (Sève's 2026-11-09 $35K deposit added ~$33 to them). The homepage is `ClearV1Panel` (summary plus tabs, v0.2 history behind a closed toggle), `/routes/` merges V1 swaps and rebalances into the v0.2 feed, and `/seve/` filters V1 activity to the Sève Safes with `?actor=`. `viem` may only be imported under `worker/`: the deploy job installs worker modules alone.

**Market index cron:** `sync-market-index` runs on the `*/15` tick and upserts one row per UTC day into `market_index_history` (migration 0031).

**Daily digest:** `scripts/digest/` holds the NUC Telegram digest (systemd timer `stablehype-digest.timer`, 08:00 Europe/Paris) — AI recap via the NUC LLM router with template fallback.

**Arb bots:** `sync-clear-v1-bot-txs` (`*/15`) reads the receipt of each bot swap tx with no row yet in `clear_v1_bot_txs` (15 per tick, newest first, no cursor) and stores what the bot's own addresses gained over the tx's Transfer logs: WETH at the Chainlink ETH/USD of that block, stablecoins and IOUs at $1, plus the gas paid. A bot tx is one `v1EventTag` calls `mev`: an address tagged in `V1_KNOWN_ACTORS`, or a sender that called itself. Tagging a new bot there backfills it on the next ticks. The maths is in `worker/src/lib/clear-v1-arb.ts`: protocol = treasury IOU + LP IOU; rebalancer = amount in less amount out less all IOUs, the redemption haircut that a rebalance takes out, before the rebalancer's conversion cost. ETH paid to a block builder inside a tx is not in a receipt and is not deducted from bot profit.

**Swap origins:** `v1SwapOrigin` in `shared/lib/clear-v1-config.ts` labels every V1 swap, in order: Team (a team or keeper address sent or received the tx), KyberSwap (the Kyber router is tx_to, or an `alpha_fee` event in the same tx was called by Kyber's executor `V1_KYBER_EXECUTOR`: an app that embeds Kyber, such as DeFi Saver, Fluid or Mayan, is its own tx_to and is shown as "via"), Arb bot (a `mev` address in `V1_KNOWN_ACTORS` or a sender that called itself), Direct, a named router or app (`V1_KNOWN_ROUTERS`), else Other. The flash arb bots also call the alpha fee router, so the fee's caller, not its presence, is what means Kyber. `/api/clear-v1-activity` returns `via_kyber` per swap; the overview returns `origins` per period (swap txs and volume per category), drawn as "Who swapped" under the Activity chart. Other should stay near zero: when it does not, look up the entry contract and name it.

**Gas runway alert:** `scripts/gas-alert/` holds a NUC timer (`clear-gas-alert.timer`, every 15 min) that reads `runwayHours` from `/api/clear-v1-gas` and sends one Telegram message per wallet at 72h, 48h and 24h from empty, to the personal chat through `/home/figue/diem-relay/.env.alerts`. Burn is the higher of the 24h and 7 day rates. A wallet with no spend in 7 days has no runway and cannot alert.

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

- **Frontend**: both Vercel projects auto-deploy on push to `main` (connected to GitHub repo). The control-center project has `NEXT_PUBLIC_SITE_MODE=control`; the investor project has no flag
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
| `GET /api/flows` | Per-coin net mint/burn flows (24h/7d/30d) + bank-run gauge, derived from the stablecoins cache |
| `GET /api/market-index` | Stablehype Market Index (SMI): market-wide 0-100 health score + daily history |
| `GET /api/clear-v1-overview` | Clear V1 state, TVL, volume, revenue, daily series, and `alphaFees` (aggregator fees taken by the ClearAlphaFeeRouter) |
| `GET /api/clear-v1-activity` | Clear V1 events (`?kind=a,b&contract=&limit=&offset=`) |
| `GET /api/clear-v1-gas` | Clear V1 per-wallet gas spend, balance, runway |
| `GET /api/clear-v1-arb` | Arb bots on Clear V1: per bot and in total, txs, volume, bot profit after gas, treasury and LP IOUs, rebalancer margin, each in dollars and bps |
| `GET /api/seve-carry` | Sève Wildcat carry book, live loan read from Plasma. Lender deposits are a hand-kept list (`DEPOSITS` in `seve-carry.ts`): a deposit missing from it makes principal, interest and the profit tile unknown until it is added |
| `GET /api/seve-capital` | Sève's stablecoins, read live: in the Rebalancer Safe, being converted by an issuer (sent out since its last payment, from Transfer logs over 10,000 blocks), idle in the Borrower Safe |
| `GET /api/seve-rebalances` | Sève's Clear V1 rebalance gains: units out less units in, net of `?costBps=` issuer redemption cost (default 1) |
| `GET /api/seve-lp` | Sève as a liquidity provider: its stablecoins in the reserves through its reserve shares (read live, base shares held by meta reserves included) against what it put in (one-way Safe to reserve transfers from `seve_reserve_transfers`, cron `sync-seve-reserve-transfers`, `*/5`, migration 0034), less reserve shares the Safes sent to an outside address, valued in stablecoins at the block before the transfer (`seve_share_transfers`, cron `sync-seve-share-transfers`, `*/5`, migration 0036; on 26 Nov 2026 the Borrower Safe sent all its meta shares to Safe 0xd884…5016). Units, not priced; put-in and gain are null while the index is behind |
| `GET /api/seve-conversions` | Sève's conversions over 90 days: mints and burns with issuers, paired by amount, and market swaps (both legs in one transaction, so not a burn), from `seve_transfers` (cron `sync-seve-transfers`, `*/5`, migration 0033) |
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
