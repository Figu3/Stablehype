# Clear V1 Indexer

**Status:** Draft, pending user review
**Date:** 2026-11-04

## Goal

Make Stablehype track Clear V1, live on Ethereum mainnet since 2026-10-27 (deploy block 26278245). Today every Clear cron, endpoint and panel still reads the v0.2 vault `0x294C…`, and no V1 address appears in the codebase.

## Decisions already made

- **Separate indexer.** V1 gets its own tables, crons and endpoints. v0.2 data stays as history.
- **Storage is D1**, not the NUC. The public site reads the Worker API, and a page cannot reach the NUC. Expected volume is under 0.1% of the included monthly D1 writes.

## Non-goals

- Changing or migrating v0.2 tables, crons, or `/api/clear-pnl`. The digest and Sève keep working unchanged.
- Stopping the v0.2 crons. That belongs to the beta close.
- Quote competitiveness against other venues (`/clear-rates` covers it).
- Alerting. Telegram alerts on keeper runway or pauses can read the new API later.

## V1 facts this design relies on

All checked on-chain or against verified source on 2026-11-04.

| Fact | Consequence |
|---|---|
| `totalReserveValue` is NET of IOU debt, `totalAssets` is gross. Base LP: 6,249 gross, 249 debt, 6,000 net. | Label gross and net explicitly. |
| Metas hold 3,373.5 of 5,992.4 bLP. | Summing reserve values double counts. See TVL below. |
| `iouTotal`, `traderIOU`, `treasuryIOU`, `lpIOU` are in **tokenIn units**. | Decimals vary: USDC, USDT, PYUSD, USDG = 6; USDS, bLP = 18. Never assume 18. |
| `lpIOU` is retained in NAV and not minted. | LP revenue comes from the `Swap` event, not from IOU mints. |
| The 3 `ioubLP` tokens share one symbol. | Key everything by address. |
| Base has no `nativeIou()` style getter. | IOU to reserve links are static config. |
| No `Swap`, `Rebalanced`, `FlashLoan` or `Withdraw` event yet. | No real fixture exists for these. See Testing. |
| `totalIOUDebt` is 18-decimal on all 4 reserves. Raw IOU supplies are not. | Sum `totalIOUDebt`, never raw supplies. |
| Metas value bLP at redemption value (1.000873 today), not market value (1.001274). | bLP is priced with `convertToRedemptionValue`. |
| Metas swap only native and bLP. PYUSD to USDG through the router emits two `Swap` rows. | Volume must be deduped per tx. |
| Meta `nativeValue`, `totalIOUDebt`, `totalReserveValue` read the oracle, which reverts when stale. | State reads must tolerate per-call failure. |
| Curve pools: 4 bps fee, 50% admin share, `fee_receiver` is the Clear treasury. | Curve admin fees are treasury revenue. |

## Architecture

```
*/5  sync-clear-v1-events ──> eth_getLogs (all V1 emitters) ──> clear_v1_events
*/15 sync-clear-v1-state  ──> Multicall3 read ──> cache row "clear-v1-state"
                                              └─> daily clear_v1_snapshots
*/15 sync-clear-v1-gas    ──> Etherscan txlist per watched wallet ──> clear_v1_gas_txs
                                        │
                  /api/clear-v1-overview, -activity, -gas ──> V1 section on /routes
```

### Units

| File | Purpose |
|---|---|
| `shared/lib/clear-v1-config.ts` | Addresses, decimals, reserve and pool metadata, gas watchlist |
| `worker/src/lib/clear-v1-decode.ts` | Pure: raw log to typed row |
| `worker/src/cron/sync-clear-v1-events.ts` | Log scan, cursor, inserts |
| `worker/src/cron/sync-clear-v1-state.ts` | Live state and daily snapshot |
| `worker/src/cron/sync-clear-v1-gas.ts` | Gas per watched wallet |
| `worker/src/api/clear-v1.ts` | The three endpoints |
| `src/components/clear-protocol/v1/` | Panel components |

The worker does not use viem today. It will, for `decodeEventLog` and multicall encoding: `Deposit` carries a `uint256[]`, and hand-decoding that is where bugs would come from. CI's worker job only runs `cd worker && npm ci`, so viem is added to `worker/package.json` and every file importing it stays under `worker/`. `shared/` stays viem-free.

## Data model

Migration `0032_clear_v1.sql`.

```sql
CREATE TABLE clear_v1_events (
  tx_hash TEXT NOT NULL,
  log_index INTEGER NOT NULL,
  block_number INTEGER NOT NULL,
  timestamp INTEGER NOT NULL,
  date TEXT NOT NULL,
  contract TEXT NOT NULL,      -- lowercase emitter
  kind TEXT NOT NULL,          -- swap | rebalance | flash_loan | deposit | withdraw
                               -- | iou_mint | iou_redeem | pool_swap | pool_liquidity | admin
  event_name TEXT NOT NULL,
  actor TEXT,                  -- event caller or trader
  tx_from TEXT,
  tx_to TEXT,                  -- entry point: aggregator, router, 4337 EntryPoint
  token_in TEXT,
  token_out TEXT,
  amount_in_raw TEXT,
  amount_out_raw TEXT,
  volume_token TEXT,           -- token that volume_units is denominated in (tokenOut)
  volume_units REAL,           -- decimals applied, not priced
  fee_token TEXT,              -- token the fee_* columns are denominated in
  fee_treasury_units REAL,
  fee_lp_units REAL,
  fee_trader_units REAL,
  args_json TEXT,              -- full decoded args
  PRIMARY KEY (tx_hash, log_index)
);
CREATE INDEX idx_clear_v1_events_date ON clear_v1_events(date, kind);
CREATE INDEX idx_clear_v1_events_contract ON clear_v1_events(contract, date);

CREATE TABLE clear_v1_snapshots (
  date TEXT NOT NULL,
  contract TEXT NOT NULL,      -- reserve or pool
  gross_par REAL,              -- NOT summable: Meta gross includes bLP. Use the TVL formula.
  net_par REAL,
  iou_debt_par REAL,
  blp_redemption_price REAL,   -- Base row only
  state_json TEXT,             -- balances, weights, parameters
  PRIMARY KEY (date, contract)
);

CREATE TABLE clear_v1_gas_txs (
  tx_hash TEXT PRIMARY KEY,
  wallet TEXT NOT NULL,
  label TEXT NOT NULL,
  category TEXT NOT NULL,      -- oracle | rebalance | admin | other
  tx_to TEXT,
  block_number INTEGER NOT NULL,
  timestamp INTEGER NOT NULL,
  date TEXT NOT NULL,
  failed INTEGER NOT NULL,
  gas_used INTEGER NOT NULL,
  gas_price_gwei REAL NOT NULL,
  gas_cost_eth REAL NOT NULL,
  value_eth REAL NOT NULL,     -- ETH sent with the tx. 0 on all 23 keeper txs so far.
  gas_cost_usd REAL
);
CREATE INDEX idx_clear_v1_gas_wallet ON clear_v1_gas_txs(wallet, date);
```

Amounts are stored unpriced and valued at read time, so a backfilled row never depends on a snapshot that did not exist when it was written.

Dropped at decode, never stored:

- `PriceUpdated`, `ClearOracleRateChanged`: the only high-frequency events (204 of 496 logs since deploy). The keeper tx row and live state carry what we need.
- `Transfer`, `Approval`: holder tracking is out of scope.
- `ClearIOUMinted`: duplicates `IOUMinted` for explicit mints, and swap-minted IOUs are already in `Swap`.

## Event ingestion

- 31 emitters: 4 reserves, 8 IOUs, 12 Curve pools, oracle, adapter, router, factory, AccessManager, Curve factory, Curve pool deployer.
- Cursor key `clear-v1-events`, initial value 26278244 so the deploy block itself is scanned. 5,000 blocks per run.
- Scan to `tip - 12`. `INSERT OR IGNORE` makes reruns safe.
- Add `rpcGetLogsMulti` to `lib/rpc.ts` for multiple addresses and no topic filter. It must require `Array.isArray(result)`: RouteMesh can return HTTP 200 with `{success:false}` inside `result`, which `rpcCall` passes through.
- If RouteMesh rejects the address list, split it into batches. Confirm the limit during implementation.
- An unknown topic is stored as `kind = admin` with the raw topic in `args_json`, so a contract change cannot silently drop events.

**Failure rule, stricter than the existing syncs.** `sync-swap-volume.ts` catches errors and returns, so `cron_health` reports success during an outage, and it advances the cursor past rows skipped for a missing timestamp. This sync does neither. Any failed log, timestamp or tx read throws before the cursor moves, so `tracked()` records the failure. `rpcGetTx` swallows errors and returns null, so a null result is treated as a failure too. Use `log.blockTimestamp` when the RPC provides it.

Reserves are read from config. A fifth reserve from `NewClearReserve` is logged and surfaced in `/api/clear-v1-overview` as `unknownReserves` rather than auto-indexed.

## Valuation

Computed at read time from the stored units.

- Stablecoins at $1 par. Depeg discount is not modelled.
- bLP at `blp_redemption_price` for that date, falling back to the nearest snapshot.
- Swap volume uses the output leg: on the depeg route `tokenIn` is the impaired one.
- Fees use the same rule on `fee_token`, so a bLP-denominated fee is priced as bLP.
- All figures are labelled "at par".

Two volume figures, because a routed swap touches several reserves:

- **Swap volume:** one value per tx, the largest `Swap` leg. This is the headline. It can understate a tx that batches unrelated swaps.
- **Reserve-leg volume:** every `Swap` row, used per reserve.

## TVL

From the live values on 2026-11-04:

```
grossTvlUSD = Base.totalAssets + Σ Meta.nativeValue     = 6,249.00 + 1,660.30 = 7,909.30
iouDebtUSD  = Σ totalIOUDebt (all 4 reserves)           = 249.00 + 747.29     =   996.29
netTvlUSD   = grossTvlUSD - iouDebtUSD                  =                       6,913.01
```

Figures are at par, not market: Base counts $1 per unit while Metas use redemption value. Curve pool liquidity is reported separately and never added: it is different capital, and much of it is the IOUs already counted as debt.

When the oracle is stale the Meta legs are unavailable, so TVL returns `null` with `partial: true` rather than a wrong number.

## Revenue

Fee routing was traced in source. Splits come from live parameters, not constants: today the baseline quote is 0% trader, 50% treasury, 50% LP, and the depeg route is 20% trader, 40% treasury, 40% LP.

| Line | Goes to | Source |
|---|---|---|
| Swap spread, treasury share | Treasury, as IOU | `Swap.treasuryIOU` |
| Swap spread, LP share | LP, in NAV | `Swap.lpIOU` |
| Trader rebate | Trader, not revenue | `Swap.traderIOU` |
| Single-asset fees | Treasury, as real tokens | `SingleAssetDeposit.fee`, `SingleAssetWithdraw.fee` |
| Flash fees | LP, in NAV | `FlashLoan.fee` |
| Curve admin fees | Treasury | `admin_balances(i)` per pool |
| Rebalance result | LP, can be negative | `Rebalanced`, `amountIn` less `amountOut` at par |

`Rebalanced` carries no fee, but par NAV moves when the two redemption prices differ, so it is a separate line and not counted as fees.

`admin_balances` shows only what is unclaimed, so that line is a live "pending" figure, not a period total. It is $0.009 today.

## Live state

Every 15 minutes, one Multicall3 `aggregate3` with `allowFailure: true` fills the `clear-v1-state` cache row: per reserve value, supply, debt, `paused`, `rebalanceNeeded`, fee parameters; per pool balances and `admin_balances`; wallet ETH balances.

Feed age comes from `oracleConfiguration`, which does not revert when a price is stale. This matters most exactly when the value reads fail. A failed sub-call becomes `null` for that field, the rest of the row still updates, and the UI shows the affected reserve as "oracle stale". If the whole multicall fails, the previous row stays, with its timestamp.

The first run of each UTC day also writes `clear_v1_snapshots`.

## Gas

Tracking runs from a watchlist in `clear-v1-config.ts`:

```ts
{ address, label, category }
```

Initial entries: oracle keeper `0xbc9d0f94…2b43`, Pauser `0xea785b9e…d37a`. The user's list of gas consumers is merged here when received.

Etherscan `txlist` per wallet is the source, not receipts of event txs, because a **reverted keeper tx emits no logs but still burns gas**. The existing `ETHERSCAN_API_KEY` covers it.

- Cursor per wallet, key `clear-v1-gas:<wallet>`, set to the block of the last stored tx, never to the tip, so an Etherscan lag cannot lose a tx. Queries start at that block, and `tx_hash` dedupes.
- Keep only `from == wallet`: `txlist` also returns incoming top-ups.
- `sort=asc`, 1,000 rows per page, looping until a short page.
- "No transactions found" is a normal empty result. Any other `NOTOK` throws.

A contract cannot pay gas, so a watchlist entry is always the paying address. If the list names contracts, the same data is grouped by `tx_to`, and any payer not yet listed is added.

Metrics per wallet: ETH and USD spent over 1/7/30 days, tx count, failure rate, `value_eth`, balance, and runway:

```
runwayDays = balance / (7-day average daily gas + value spend)
```

Runway is `null` under 3 days of data, because the current estimate rests on 5 hours at 0.128 gwei and would mislead. Also return runway at the 30-day p95 gas price when available, since gas price drives the result far more than cadence.

## API

| Endpoint | Returns |
|---|---|
| `GET /api/clear-v1-overview` | State, TVL, 1/7/30-day volume and revenue, daily series, `unknownReserves`, `updatedAt` |
| `GET /api/clear-v1-activity` | Paginated events, `?kind=&contract=&limit=&offset=` |
| `GET /api/clear-v1-gas` | Per-wallet metrics and daily series |

## Frontend

On `/routes`, a V1 section renders first, with the v0.2 panel below under a "v0.2 history" heading.

- KPIs: gross TVL, net TVL, 7-day volume, 7-day revenue.
- Reserve table: gross, net, debt, share price, paused, rebalance needed.
- Curve pools: balances, volume, third-party flow by entry point.
- Oracle: per-feed age and price.
- Gas: per-wallet spend, failures, balance, runway.
- Activity feed, with admin events filterable.

Zero activity renders as "No swaps yet", not as an empty chart.

## Error handling

Each sync goes through `tracked()` and throws on failure, so `cron_health` and `/status/` report it truthfully. A failed sync leaves its cursor untouched. Responses carry `updatedAt`, and the panel shows a stale badge past 30 minutes.

## Testing

Worker code has no test runner today. `vitest.config.ts` is extended to include `worker/src/**/__tests__`.

1. **Decoder, real logs:** fixtures from mainnet for `Deposit` (Base and Meta), `IOUMinted`, `TokenExchange`, `AddLiquidity`, `Paused`.
2. **Decoder, encoded logs:** `Swap`, `Rebalanced`, `FlashLoan`, `Withdraw` built with viem from the verified ABI, since none exist on-chain. Cover each decimals case, including a 6-decimal `tokenIn` and an 18-decimal bLP.
3. **Valuation:** bLP uses redemption price; the fee split sums to `iouTotal`; a two-leg routed swap counts once in swap volume and twice in reserve-leg volume.
4. **TVL:** reproduces the worked example, proving bLP is not double counted.
5. **Failure paths:** the `{success:false}` body and a null tx both throw without moving the cursor; an incoming top-up is not counted as gas; "No transactions found" does not throw.
6. **Dropped events:** `Transfer`, `Approval` and `ClearIOUMinted` produce no row, and `iou_mint` counts 8 for the seed.

## Verification before merge

- After backfill, event counts per kind match an independent scan through a different RPC, excluding the two oracle events.
- Reserve values in the API match `cast call` at the same time.
- `npx tsc --noEmit` in `worker/`, `npm run build`, `npm run lint`, `npm test` all pass.
- The V1 section renders on a local preview against the local Worker, including the zero-swap state.

## Rollout

`deploy-cloudflare.yml` applies migrations and deploys the Worker and frontend on every push to `main`, so **merging is the deploy**. There is no separate step to stage them.

1. Open a PR from `feat/clear-v1-indexer` and pass the verification list locally.
2. Get the user's go-ahead, then merge.
3. Backfill runs by itself, about 13 cron ticks at 5,000 blocks per run.
4. Check `/status/` and compare the production API with the independent scan.

## Open items

- User's list of gas-consuming contracts.
- Which address `0x5ecbaf07…` is, and whether it belongs on the watchlist.
- Register the oracle keeper `0xbc9d0f94…` in `contracts.json`.
