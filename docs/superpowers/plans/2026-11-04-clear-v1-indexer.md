# Clear V1 Indexer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track Clear V1 in Stablehype: flows, revenue, TVL, Curve pools, oracle freshness, keeper gas.

**Architecture:** Three new Worker crons write to new D1 tables and one cache row. Pure decode and metrics modules hold all the logic and are unit tested. Three new endpoints feed a V1 panel above the existing v0.2 panel. No v0.2 code changes.

**Tech Stack:** Cloudflare Workers, D1, viem (worker only), Next.js 16, TanStack Query, vitest.

**Spec:** `docs/superpowers/specs/2026-11-04-clear-v1-indexer-design.md`. Read it first.

**Rules for every task:**
- Work on branch `feat/clear-v1-indexer`. Never push to `main`: a push there applies migrations and deploys everything.
- Never open `worker/.dev.vars` or any env file.
- No em dashes in code comments, UI text or docs.
- `viem` may only be imported under `worker/`.

---

## File map

| File | Action | Responsibility |
|---|---|---|
| `worker/package.json`, `worker/package-lock.json` | Modify | Add viem |
| `worker/tsconfig.json` | Modify | Exclude tests from the deploy type-check |
| `vitest.config.ts` | Modify | Run worker and shared tests |
| `worker/migrations/0032_clear_v1.sql` | Create | Tables |
| `shared/lib/clear-v1-config.ts` | Create | Addresses, tokens, pools, watchlist |
| `worker/src/lib/clear-v1-decode.ts` | Create | Raw log to row |
| `worker/src/lib/clear-v1-metrics.ts` | Create | Valuation, TVL, volume, revenue, runway |
| `worker/src/lib/rpc.ts` | Modify | `rpcGetLogsMulti`, `rpcGetTxStrict`, `rpcEthCall` |
| `worker/src/cron/sync-clear-v1-events.ts` | Create | Log scan |
| `worker/src/cron/sync-clear-v1-state.ts` | Create | Live state, snapshots |
| `worker/src/cron/sync-clear-v1-gas.ts` | Create | Gas per wallet |
| `worker/src/api/clear-v1.ts` | Create | Three endpoints |
| `worker/src/index.ts`, `worker/src/router.ts` | Modify | Wiring |
| `src/hooks/use-clear-v1.ts` | Create | Query hooks and types |
| `src/components/clear-protocol/v1/*` | Create | Panel |
| `src/components/homepage-client.tsx` | Modify | Mount panel |
| `CLAUDE.md` | Modify | Docs |

---

### Task 1: Tooling and migration

**Files:** `worker/package.json`, `worker/package-lock.json`, `worker/tsconfig.json`, `vitest.config.ts`, `worker/migrations/0032_clear_v1.sql`

- [ ] **Step 1: Add viem to the worker**

Run: `cd worker && npm install viem@^2.46.3`
Expected: `worker/package.json` lists viem under `dependencies`, lockfile updated.

- [ ] **Step 2: Exclude tests from the worker type-check**

In `worker/tsconfig.json` change the exclude line to:

```json
"exclude": ["node_modules", "**/__tests__/**", "../shared/**/__tests__/**"]
```

- [ ] **Step 3: Extend vitest**

In `vitest.config.ts` set:

```ts
include: ["src/**/__tests__/**/*.test.ts", "shared/**/__tests__/**/*.test.ts", "worker/src/**/__tests__/**/*.test.ts"],
```

Also add to `resolve.alias`: `"@shared": path.resolve(__dirname, "shared"),`

- [ ] **Step 4: Run the existing suite**

Run: `npm test`
Expected: PASS. If a `shared/` test now fails because it never ran before, stop and report it. Do not fix or delete it silently.

- [ ] **Step 5: Create the migration**

Copy the three `CREATE TABLE` blocks and their indexes from the spec's Data model section into `worker/migrations/0032_clear_v1.sql` exactly.

- [ ] **Step 6: Apply locally**

Run: `cd worker && npx wrangler d1 migrations apply stablecoin-db --local`
Expected: `0032_clear_v1.sql` applied.

- [ ] **Step 7: Commit**

```bash
git add worker/package.json worker/package-lock.json worker/tsconfig.json vitest.config.ts worker/migrations/0032_clear_v1.sql
git commit -m "chore(clear-v1): viem in worker, test config, migration"
```

---

### Task 2: Config

**Files:** Create `shared/lib/clear-v1-config.ts`, test `shared/lib/__tests__/clear-v1-config.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { V1_EMITTERS, V1_POOLS, V1_RESERVES, V1_TOKENS } from "../clear-v1-config";

describe("clear v1 config", () => {
  it("lists 31 unique lowercase emitters", () => {
    expect(V1_EMITTERS).toHaveLength(31);
    expect(new Set(V1_EMITTERS).size).toBe(31);
    for (const a of V1_EMITTERS) expect(a).toBe(a.toLowerCase());
  });
  it("knows decimals for every pool coin", () => {
    for (const p of V1_POOLS) for (const c of p.coins) expect(V1_TOKENS[c]).toBeDefined();
  });
  it("has one base and three meta reserves", () => {
    expect(V1_RESERVES.filter((r) => r.kind === "base")).toHaveLength(1);
    expect(V1_RESERVES.filter((r) => r.kind === "meta")).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run shared/lib/__tests__/clear-v1-config.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```ts
/**
 * Clear V1 mainnet addresses. Source of truth: .claude/registry/contracts.json, verified on-chain 2026-11-04.
 * All addresses lowercase. Key everything by address: the 3 ioubLP tokens share one symbol.
 */

export const V1_DEPLOY_BLOCK = 26278245;

export const V1_ORACLE = "0x323f9737f4a2763fa419bd679ce0d7a2bc322a30";
export const V1_ADAPTER = "0x39b548e590ec3b6333a200fa715f9eab04f76858";
export const V1_ROUTER = "0x0c431a85fdfedccf63692d47f34cce4db17566aa";
export const V1_FACTORY = "0x2b2a51bbf9d3794490b9edda1b2b46d5aefd0a95";
export const V1_ACCESS_MANAGER = "0x5601d10ab86d2b119f169232baab39b317dd498e";
export const V1_CURVE_FACTORY = "0xa671f7f070b6848ec0f0b83d6c7556e671327935";
export const V1_POOL_DEPLOYER = "0xfc68a38e82308bc809612892062b440658c5e89f";

export const V1_BASE_RESERVE = "0xd1b4d7f6f651c13b687a22fc97b718aad3a0e41d";
const CLR_USD = "0xb9ca6ea808f54576ae6350c266469e35e099ea6d";

const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const USDT = "0xdac17f958d2ee523a2206206994597c13d831ec7";
const PYUSD = "0x6c3ea9036406852006290770bedfcaba0e23a0e8";
const USDG = "0xe343167631d89b6ffc58b88d6b7fb0228795491d";
const USDS = "0xdc035d45d973e3ec169d2276ddab16f1e407384f";

export interface V1Reserve {
  address: string;
  label: string;
  kind: "base" | "meta";
}

export const V1_RESERVES: V1Reserve[] = [
  { address: V1_BASE_RESERVE, label: "Base LP", kind: "base" },
  { address: "0x4ff500233d1898ae2ac5ad61296780ba35dcaed4", label: "Meta PYUSD", kind: "meta" },
  { address: "0xd09f313a9b6f3136935cebda26178933fd7973cd", label: "Meta USDG", kind: "meta" },
  { address: "0x070f56b62e3352d6d8fa52024bbf4c51d6917317", label: "Meta USDS", kind: "meta" },
];

export const V1_TOKENS: Record<string, { symbol: string; decimals: number }> = {
  [USDC]: { symbol: "USDC", decimals: 6 },
  [USDT]: { symbol: "USDT", decimals: 6 },
  [PYUSD]: { symbol: "PYUSD", decimals: 6 },
  [USDG]: { symbol: "USDG", decimals: 6 },
  [USDS]: { symbol: "USDS", decimals: 18 },
  [V1_BASE_RESERVE]: { symbol: "bLP", decimals: 18 },
  [CLR_USD]: { symbol: "clrUSD", decimals: 18 },
  "0x32d32646f13a537d95742f5dd4c4ea3ab941d598": { symbol: "iouUSDC", decimals: 6 },
  "0x20beb4673f12f6ac7f9c2927141b80937cca4048": { symbol: "iouUSDT", decimals: 6 },
  "0x5f25883365a796619c5b7b63166748779d85e650": { symbol: "iouPYUSD", decimals: 6 },
  "0x62c175cfb14942e2cd0076da8e17c0e166a4f129": { symbol: "iouUSDG", decimals: 6 },
  "0x5ff89ece8d85df7033dda4dc4271553be1197cda": { symbol: "iouUSDS", decimals: 18 },
  "0x79fc316accbb526e7833bc4dbb98d79e5fc743f2": { symbol: "ioubLP (PYUSD)", decimals: 18 },
  "0x80ba609711f344f12551d14f2fa7836829896589": { symbol: "ioubLP (USDG)", decimals: 18 },
  "0xa44fd913be3ef82eebdcb2989e1587b70e279b25": { symbol: "ioubLP (USDS)", decimals: 18 },
};

const IOU_ADDRESSES = Object.keys(V1_TOKENS).filter((a) => V1_TOKENS[a].symbol.startsWith("iou"));

export interface V1Pool {
  address: string;
  label: string;
  coins: [string, string];
}

const meta = (address: string, coin: string): V1Pool => ({
  address,
  label: `${V1_TOKENS[coin].symbol} / clrUSD`,
  coins: [coin, CLR_USD],
});

// coins() order verified on-chain 2026-11-04.
export const V1_POOLS: V1Pool[] = [
  { address: CLR_USD, label: "USDC / USDT (clrUSD)", coins: [USDC, USDT] },
  meta("0xf97d77f833daeab3efb3c348765a725757f46ae6", "0x32d32646f13a537d95742f5dd4c4ea3ab941d598"),
  meta("0xa421bf8ffebacb505991bbc528b4efbb3752ef71", "0x20beb4673f12f6ac7f9c2927141b80937cca4048"),
  meta("0x7d516bd28bfa5c3127813316693a605f25c4dfd8", "0x5f25883365a796619c5b7b63166748779d85e650"),
  meta("0xc9bdd0638a00e60f75dc0a71308ad88020032e47", "0x62c175cfb14942e2cd0076da8e17c0e166a4f129"),
  meta("0x7fd9f0b476ae5b7376370289f6f62c10b74a5965", "0x5ff89ece8d85df7033dda4dc4271553be1197cda"),
  meta("0x0823643ce50c331aafc097a85353c4bd4cc59d1c", "0x79fc316accbb526e7833bc4dbb98d79e5fc743f2"),
  meta("0x2355230b10e4530a7350bd0e8e82cfeccae37c2b", "0x80ba609711f344f12551d14f2fa7836829896589"),
  meta("0xfccfa247736ed8cfe66d52bcb6094083840666ba", "0xa44fd913be3ef82eebdcb2989e1587b70e279b25"),
  meta("0xe48f42c6c63e3577bf46c9f542b8806a67561419", PYUSD),
  meta("0x0416534873579194f29726f91678c34f7ebc9ea8", USDG),
  meta("0xb14d3fe06f4b000789c420cbc5a6536b5693b20b", USDS),
];

export const V1_FEEDS = [USDC, USDT, PYUSD, USDG, USDS];

export const V1_EMITTERS: string[] = [
  ...V1_RESERVES.map((r) => r.address),
  ...IOU_ADDRESSES,
  ...V1_POOLS.map((p) => p.address),
  V1_ORACLE,
  V1_ADAPTER,
  V1_ROUTER,
  V1_FACTORY,
  V1_ACCESS_MANAGER,
  V1_CURVE_FACTORY,
  V1_POOL_DEPLOYER,
];

export type GasCategory = "oracle" | "rebalance" | "admin" | "other";

export interface GasWallet {
  address: string;
  label: string;
  category: GasCategory;
}

// Paying addresses. A contract cannot pay gas: add the address that calls it.
export const V1_GAS_WATCHLIST: GasWallet[] = [
  { address: "0xbc9d0f94ffc516f9b5e87a8480156b8d12332b43", label: "Oracle keeper", category: "oracle" },
  { address: "0xea785b9eb31b08bb6cb13ef558eaba2b0014d37a", label: "Pauser", category: "admin" },
];
```

Note: 4 + 8 + 12 + 7 = 31.

- [ ] **Step 4: Run it**

Run: `npx vitest run shared/lib/__tests__/clear-v1-config.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/lib/clear-v1-config.ts shared/lib/__tests__/clear-v1-config.test.ts
git commit -m "feat(clear-v1): contract config"
```

---

### Task 3: Decoder

**Files:** Create `worker/src/lib/clear-v1-decode.ts`, test `worker/src/lib/__tests__/clear-v1-decode.test.ts`, fixture `worker/src/lib/__tests__/fixtures/clear-v1-logs.json`

- [ ] **Step 1: Export fixtures**

Fetch one real log per event with `eth_getLogs` on `https://rpc.mevblocker.io` (Chrome User-Agent, 1.5 s between calls, 10,000-block windows from 26338245). Save into the fixture file under keys `base_deposit`, `meta_deposit`, `iou`, `exchange`, `addliq`, `paused`, `price`, `transfer`, each with `address`, `topics`, `data`, `blockNumber`, `transactionHash`, `logIndex`. `exchange` must be the log in tx `0x1414ed9cbbfb7f24acc2ca8a2d2bde346dc3ab36b0bdd4f79c3c197df20980e5`: 5,323,842 raw USDT sold (coin 1).

- [ ] **Step 2: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { encodeAbiParameters, encodeEventTopics, parseAbi } from "viem";
import { decodeLog, V1_EVENTS, type V1Log } from "../clear-v1-decode";
import fx from "./fixtures/clear-v1-logs.json";

const BASE = "0xd1b4d7f6f651c13b687a22fc97b718aad3a0e41d";
const META = "0x4ff500233d1898ae2ac5ad61296780ba35dcaed4";
const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const USDT = "0xdac17f958d2ee523a2206206994597c13d831ec7";
const PYUSD = "0x6c3ea9036406852006290770bedfcaba0e23a0e8";
const TRADER = "0x00000000000000000000000000000000000000aa";

const swapLog = (address: string, tokenIn: string, tokenOut: string, a: bigint[]): V1Log => ({
  address,
  topics: encodeEventTopics({
    abi: V1_EVENTS,
    eventName: "Swap",
    args: { trader: TRADER, tokenIn, tokenOut } as never,
  }) as string[],
  data: encodeAbiParameters(
    [{ type: "address" }, ...a.map(() => ({ type: "uint256" }))],
    [TRADER, ...a] as never,
  ),
  blockNumber: "0x1",
  transactionHash: "0xabc",
  logIndex: "0x0",
});

describe("decodeLog", () => {
  it("decodes a Base deposit from a real log", () => {
    const row = decodeLog(fx.base_deposit as V1Log);
    expect(row?.kind).toBe("deposit");
    expect(row?.actor).toMatch(/^0x[0-9a-f]{40}$/);
  });
  it("decodes a Meta deposit despite the different signature", () => {
    expect(decodeLog(fx.meta_deposit as V1Log)?.kind).toBe("deposit");
  });
  it("decodes a Curve exchange using the pool's coin order", () => {
    const row = decodeLog(fx.exchange as V1Log);
    expect(row?.kind).toBe("pool_swap");
    expect(row?.token_in).toBe(USDT);
    expect(row?.token_out).toBe(USDC);
    expect(row?.amount_in_raw).toBe("5323842");
  });
  it("classifies mint, liquidity and pause", () => {
    expect(decodeLog(fx.iou as V1Log)?.kind).toBe("iou_mint");
    expect(decodeLog(fx.addliq as V1Log)?.kind).toBe("pool_liquidity");
    expect(decodeLog(fx.paused as V1Log)?.kind).toBe("admin");
  });
  it("drops noise events", () => {
    expect(decodeLog(fx.price as V1Log)).toBeNull();
    expect(decodeLog(fx.transfer as V1Log)).toBeNull();
  });
  it("keeps an unknown topic as admin with the raw topic", () => {
    const row = decodeLog({ ...(fx.paused as V1Log), topics: ["0xdead"] });
    expect(row?.kind).toBe("admin");
    expect(row?.event_name).toBe("unknown");
    expect(row?.args_json).toContain("0xdead");
  });
  it("drops the IOU echo events and Approval", () => {
    for (const eventName of ["ClearIOUMinted", "ClearIOUBurned", "Approval"] as const) {
      const log = { ...(fx.paused as V1Log), topics: encodeEventTopics({ abi: V1_EVENTS, eventName }) as string[], data: "0x" + "00".repeat(64) };
      expect(decodeLog(log)).toBeNull();
    }
  });
  it("maps TokenExchangeUnderlying ids to the base pool coins with their decimals", () => {
    const row = decodeLog({
      address: "0x7d516bd28bfa5c3127813316693a605f25c4dfd8", // iouPYUSD / clrUSD
      topics: encodeEventTopics({ abi: V1_EVENTS, eventName: "TokenExchangeUnderlying", args: { buyer: TRADER } as never }) as string[],
      data: encodeAbiParameters(
        [{ type: "int128" }, { type: "uint256" }, { type: "int128" }, { type: "uint256" }],
        [0n, 2_000_000n, 1n, 1_990_000n],
      ),
      blockNumber: "0x1", transactionHash: "0xabc", logIndex: "0x0",
    });
    expect(row?.token_out).toBe(USDC);
    expect(row?.volume_units).toBeCloseTo(1.99, 6);
  });
  it("splits fees so the parts sum to iouTotal", () => {
    const row = decodeLog(swapLog(BASE, USDC, USDT, [1_000_000n, 999_000n, 1000n, 200n, 400n, 400n]));
    const sum = row!.fee_trader_units! + row!.fee_treasury_units! + row!.fee_lp_units!;
    expect(sum).toBeCloseTo(0.001, 8);
  });
  it("uses tokenIn decimals for fees on a 6-decimal swap", () => {
    const row = decodeLog(swapLog(BASE, USDC, USDT, [1_000_000n, 999_700n, 300n, 0n, 150n, 150n]));
    expect(row?.kind).toBe("swap");
    expect(row?.volume_token).toBe(USDT);
    expect(row?.volume_units).toBeCloseTo(0.9997, 6);
    expect(row?.fee_token).toBe(USDC);
    expect(row?.fee_treasury_units).toBeCloseTo(0.00015, 8);
    expect(row?.fee_lp_units).toBeCloseTo(0.00015, 8);
  });
  it("uses 18 decimals for a bLP tokenIn", () => {
    const row = decodeLog(swapLog(META, BASE, PYUSD, [10n ** 18n, 999_000n, 3n * 10n ** 14n, 0n, 10n ** 14n, 2n * 10n ** 14n]));
    expect(row?.fee_token).toBe(BASE);
    expect(row?.fee_treasury_units).toBeCloseTo(0.0001, 8);
    expect(row?.volume_units).toBeCloseTo(0.999, 6);
  });
  it("leaves units null for an unknown token but keeps raw", () => {
    const row = decodeLog(swapLog(BASE, TRADER, USDT, [5n, 5n, 0n, 0n, 0n, 0n]));
    expect(row?.fee_treasury_units).toBeNull();
    expect(row?.amount_in_raw).toBe("5");
  });
});
```

Add a test that `NewClearReserve` decodes as `kind = admin` with `reserve` inside `args_json`. Add one test each for `Rebalanced`, `FlashLoan` (fee goes to `fee_lp_units`), `SingleAssetDeposit` (fee goes to `fee_treasury_units`) and `Withdraw`, built with the same `encodeEventTopics` pattern.

- [ ] **Step 3: Run it**

Run: `npx vitest run worker/src/lib/__tests__/clear-v1-decode.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 4: Implement**

```ts
import { decodeEventLog, formatUnits, parseAbi, type Hex } from "viem";
import { V1_POOLS, V1_TOKENS } from "@shared/lib/clear-v1-config";

export interface V1Log {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  transactionHash: string;
  logIndex: string;
}

export type V1Kind =
  | "swap" | "rebalance" | "flash_loan" | "deposit" | "withdraw"
  | "iou_mint" | "iou_redeem" | "pool_swap" | "pool_liquidity" | "admin";

export interface V1Row {
  tx_hash: string;
  log_index: number;
  block_number: number;
  contract: string;
  kind: V1Kind;
  event_name: string;
  actor: string | null;
  token_in: string | null;
  token_out: string | null;
  amount_in_raw: string | null;
  amount_out_raw: string | null;
  volume_token: string | null;
  volume_units: number | null;
  fee_token: string | null;
  fee_treasury_units: number | null;
  fee_lp_units: number | null;
  fee_trader_units: number | null;
  args_json: string;
}

export const V1_EVENTS = parseAbi([
  "event Swap(address indexed trader, address indexed tokenIn, address indexed tokenOut, address recipient, uint256 amountIn, uint256 amountOut, uint256 iouTotal, uint256 traderIOU, uint256 treasuryIOU, uint256 lpIOU)",
  "event Rebalanced(address indexed caller, address indexed tokenIn, address indexed tokenOut, address recipient, uint256 amountIn, uint256 amountOut)",
  "event FlashLoan(address indexed initiator, address indexed receiver, address indexed token, uint256 amount, uint256 fee)",
  "event Deposit(address indexed caller, address indexed receiver, uint256 lpMinted, uint256[] amounts)",
  "event Deposit(address indexed caller, address indexed receiver, uint256 baseLpIn, uint256 nativeIn, uint256 metaLpMinted)",
  "event Withdraw(address indexed caller, address indexed receiver, uint256 lpBurned, uint256[] amounts)",
  "event Withdraw(address indexed caller, address indexed receiver, uint256 metaLpBurned, uint256 baseLpOut, uint256 nativeOut)",
  "event SingleAssetDeposit(address indexed caller, address indexed receiver, address indexed asset, uint256 amountIn, uint256 fee, uint256 lpMinted)",
  "event SingleAssetWithdraw(address indexed caller, address indexed receiver, address indexed asset, uint256 lpBurned, uint256 fee, uint256 amountOut)",
  "event IOUMinted(address indexed caller, address indexed asset, address indexed receiver, uint256 amount)",
  "event IOURedeemed(address indexed holder, address indexed asset, address indexed receiver, uint256 amount)",
  "event TokenExchange(address indexed buyer, int128 sold_id, uint256 tokens_sold, int128 bought_id, uint256 tokens_bought)",
  "event TokenExchangeUnderlying(address indexed buyer, int128 sold_id, uint256 tokens_sold, int128 bought_id, uint256 tokens_bought)",
  "event AddLiquidity(address indexed provider, uint256[] token_amounts, uint256[] fees, uint256 invariant, uint256 token_supply)",
  "event RemoveLiquidity(address indexed provider, uint256[] token_amounts, uint256[] fees, uint256 token_supply)",
  "event RemoveLiquidityOne(address indexed provider, int128 token_id, uint256 token_amount, uint256 coin_amount, uint256 token_supply)",
  "event RemoveLiquidityImbalance(address indexed provider, uint256[] token_amounts, uint256[] fees, uint256 invariant, uint256 token_supply)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event Approval(address indexed owner, address indexed spender, uint256 value)",
  "event PriceUpdated(address indexed asset, uint256 price, uint256 publishTime)",
  "event ClearOracleRateChanged(address indexed asset, uint256 price)",
  "event ClearIOUMinted(address indexed to, uint256 amount, uint256 treasuryFee)",
  "event ClearIOUBurned(address indexed from, uint256 amount)",
  "event Paused(address account)",
  "event Unpaused(address account)",
  "event NewClearReserve(uint256 indexed index, address indexed implementation, uint8 reserveType, address reserve, string name, string symbol, address[] tokens)",
]);

const DROPPED = new Set([
  "Transfer", "Approval", "PriceUpdated", "ClearOracleRateChanged", "ClearIOUMinted", "ClearIOUBurned",
]);

const POOLS = new Map(V1_POOLS.map((p) => [p.address, p]));

const lower = (v: unknown): string | null => (typeof v === "string" ? v.toLowerCase() : null);

function units(raw: bigint | undefined, token: string | null): number | null {
  if (raw === undefined || !token) return null;
  const meta = V1_TOKENS[token];
  return meta ? Number(formatUnits(raw, meta.decimals)) : null;
}

const json = (v: unknown) =>
  JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x));

export function decodeLog(log: V1Log): V1Row | null {
  const contract = log.address.toLowerCase();
  const base: V1Row = {
    tx_hash: log.transactionHash,
    log_index: parseInt(log.logIndex, 16),
    block_number: parseInt(log.blockNumber, 16),
    contract,
    kind: "admin",
    event_name: "unknown",
    actor: null,
    token_in: null,
    token_out: null,
    amount_in_raw: null,
    amount_out_raw: null,
    volume_token: null,
    volume_units: null,
    fee_token: null,
    fee_treasury_units: null,
    fee_lp_units: null,
    fee_trader_units: null,
    args_json: json({ topics: log.topics, data: log.data }),
  };

  let name: string;
  let a: Record<string, unknown>;
  try {
    const d = decodeEventLog({
      abi: V1_EVENTS,
      topics: log.topics as [Hex, ...Hex[]],
      data: log.data as Hex,
    });
    name = d.eventName;
    a = d.args as unknown as Record<string, unknown>;
  } catch {
    return base; // unknown topic: keep raw so a contract change cannot silently drop events
  }

  if (DROPPED.has(name)) return null;

  const row: V1Row = { ...base, event_name: name, args_json: json(a) };
  const big = (k: string) => a[k] as bigint | undefined;

  switch (name) {
    case "Swap": {
      const tokenIn = lower(a.tokenIn);
      const tokenOut = lower(a.tokenOut);
      return {
        ...row,
        kind: "swap",
        actor: lower(a.trader),
        token_in: tokenIn,
        token_out: tokenOut,
        amount_in_raw: String(a.amountIn),
        amount_out_raw: String(a.amountOut),
        volume_token: tokenOut,
        volume_units: units(big("amountOut"), tokenOut),
        fee_token: tokenIn, // IOU fields are in tokenIn units
        fee_treasury_units: units(big("treasuryIOU"), tokenIn),
        fee_lp_units: units(big("lpIOU"), tokenIn),
        fee_trader_units: units(big("traderIOU"), tokenIn),
      };
    }
    case "Rebalanced": {
      const tokenOut = lower(a.tokenOut);
      return {
        ...row,
        kind: "rebalance",
        actor: lower(a.caller),
        token_in: lower(a.tokenIn),
        token_out: tokenOut,
        amount_in_raw: String(a.amountIn),
        amount_out_raw: String(a.amountOut),
        volume_token: tokenOut,
        volume_units: units(big("amountOut"), tokenOut),
      };
    }
    case "FlashLoan": {
      const token = lower(a.token);
      return {
        ...row,
        kind: "flash_loan",
        actor: lower(a.initiator),
        token_in: token,
        amount_in_raw: String(a.amount),
        volume_token: token,
        volume_units: units(big("amount"), token),
        fee_token: token,
        fee_lp_units: units(big("fee"), token), // stays in the reserve, accrues to LPs via NAV
      };
    }
    case "SingleAssetDeposit": {
      const asset = lower(a.asset);
      return {
        ...row,
        kind: "deposit",
        actor: lower(a.caller),
        token_in: asset,
        amount_in_raw: String(a.amountIn),
        volume_token: asset,
        volume_units: units(big("amountIn"), asset),
        fee_token: asset,
        fee_treasury_units: units(big("fee"), asset), // pushed to the treasury as real tokens
      };
    }
    case "SingleAssetWithdraw": {
      const asset = lower(a.asset);
      return {
        ...row,
        kind: "withdraw",
        actor: lower(a.caller),
        token_out: asset,
        amount_out_raw: String(a.amountOut),
        volume_token: asset,
        volume_units: units(big("amountOut"), asset),
        fee_token: asset,
        fee_treasury_units: units(big("fee"), asset),
      };
    }
    case "Deposit":
      return { ...row, kind: "deposit", actor: lower(a.caller) };
    case "Withdraw":
      return { ...row, kind: "withdraw", actor: lower(a.caller) };
    case "IOUMinted":
    case "IOURedeemed": {
      const asset = lower(a.asset);
      return {
        ...row,
        kind: name === "IOUMinted" ? "iou_mint" : "iou_redeem",
        actor: lower(a.caller ?? a.holder),
        token_in: asset,
        amount_in_raw: String(a.amount),
        volume_token: asset,
        volume_units: units(big("amount"), asset),
      };
    }
    case "TokenExchange":
    case "TokenExchangeUnderlying": {
      const pool = POOLS.get(contract);
      // Underlying ids index [coin0, ...base pool coins], not the pool's own coins.
      const coins = pool && name === "TokenExchangeUnderlying" ? [pool.coins[0], ...V1_POOLS[0].coins] : pool?.coins;
      const tokenIn = coins?.[Number(a.sold_id)] ?? null;
      const tokenOut = coins?.[Number(a.bought_id)] ?? null;
      return {
        ...row,
        kind: "pool_swap",
        actor: lower(a.buyer),
        token_in: tokenIn,
        token_out: tokenOut,
        amount_in_raw: String(a.tokens_sold),
        amount_out_raw: String(a.tokens_bought),
        volume_token: tokenOut,
        volume_units: units(big("tokens_bought"), tokenOut),
      };
    }
    case "AddLiquidity":
    case "RemoveLiquidity":
    case "RemoveLiquidityOne":
    case "RemoveLiquidityImbalance":
      return { ...row, kind: "pool_liquidity", actor: lower(a.provider) };
    default:
      return row; // Paused, Unpaused
  }
}
```

Parameter-change events (`SwapSpreadBpsUpdated` and the like) are not in `V1_EVENTS`, so they land as `admin` / `unknown` with raw data. That is intended: rare, and the activity feed shows them.

- [ ] **Step 5: Run it**

Run: `npx vitest run worker/src/lib/__tests__/clear-v1-decode.test.ts`
Expected: PASS. If `decodeEventLog` picks the wrong `Deposit` overload, the Meta test fails: fix by trying each signature, not by weakening the test.

- [ ] **Step 6: Commit**

```bash
git add worker/src/lib/clear-v1-decode.ts worker/src/lib/__tests__
git commit -m "feat(clear-v1): event decoder with real and encoded fixtures"
```

---

### Task 4: Strict RPC helpers

**Files:** Modify `worker/src/lib/rpc.ts`, test `worker/src/lib/__tests__/rpc-strict.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { rpcGetLogsMulti, rpcGetTxStrict } from "../rpc";

const reply = (body: unknown) =>
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body))));

afterEach(() => vi.unstubAllGlobals());

describe("strict rpc", () => {
  it("returns logs", async () => {
    reply({ jsonrpc: "2.0", id: 1, result: [{ address: "0x1" }] });
    await expect(rpcGetLogsMulti("u", ["0x1"], 1, 2)).resolves.toHaveLength(1);
  });
  it("throws on the RouteMesh HTTP 200 fault body", async () => {
    reply({ jsonrpc: "2.0", id: 1, result: { success: false, message: "gateway_timeout" } });
    await expect(rpcGetLogsMulti("u", ["0x1"], 1, 2)).rejects.toThrow(/not an array/);
  });
  it("throws when a tx is missing", async () => {
    reply({ jsonrpc: "2.0", id: 1, result: null });
    await expect(rpcGetTxStrict("u", "0xabc")).rejects.toThrow(/0xabc/);
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run worker/src/lib/__tests__/rpc-strict.test.ts`
Expected: FAIL. Note `rpcCall` rejects `undefined` but passes `null`, so `null` must be handled in `rpcGetTxStrict`.

- [ ] **Step 3: Implement**

Append to `worker/src/lib/rpc.ts`:

```ts
/**
 * All logs for many addresses. Unlike rpcGetLogs this fails loudly: RouteMesh can
 * return HTTP 200 with a fault object in `result`, and an empty scan must never be
 * confused with a failed one.
 */
export async function rpcGetLogsMulti(
  rpcUrl: string,
  addresses: string[],
  fromBlock: number,
  toBlock: number
): Promise<RawLog[]> {
  const result = await rpcCall<unknown>(rpcUrl, "eth_getLogs", [
    {
      address: addresses,
      fromBlock: "0x" + fromBlock.toString(16),
      toBlock: "0x" + toBlock.toString(16),
    },
  ]);
  if (!Array.isArray(result)) {
    throw new RpcError(`eth_getLogs: result is not an array: ${JSON.stringify(result).slice(0, 200)}`);
  }
  return result as RawLog[];
}

export interface RawLog {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  transactionHash: string;
  logIndex: string;
  blockTimestamp?: string;
}

/** Like rpcGetTx, but throws instead of returning null. */
export async function rpcGetTxStrict(rpcUrl: string, hash: string): Promise<RpcTx> {
  const tx = await rpcCall<{ from: string; to: string | null } | null>(rpcUrl, "eth_getTransactionByHash", [hash]);
  if (!tx) throw new RpcError(`eth_getTransactionByHash: no tx ${hash}`);
  return { from: tx.from.toLowerCase(), to: (tx.to ?? "").toLowerCase() };
}

export async function rpcEthCall(rpcUrl: string, to: string, data: string): Promise<string> {
  return rpcCall<string>(rpcUrl, "eth_call", [{ to, data }, "latest"]);
}

export async function rpcGetBlockTimestampStrict(rpcUrl: string, blockNumber: number): Promise<number> {
  const block = await rpcCall<{ timestamp: string } | null>(rpcUrl, "eth_getBlockByNumber", [
    "0x" + blockNumber.toString(16),
    false,
  ]);
  if (!block?.timestamp) throw new RpcError(`eth_getBlockByNumber: no block ${blockNumber}`);
  return parseInt(block.timestamp, 16);
}
```

Check the shape of `RpcTx` at `rpc.ts:16` first and match it.

- [ ] **Step 4: Run it**

Run: `npx vitest run worker/src/lib/__tests__/rpc-strict.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add worker/src/lib/rpc.ts worker/src/lib/__tests__/rpc-strict.test.ts
git commit -m "feat(rpc): strict helpers that fail loudly"
```

---

### Task 5: Events cron

**Files:** Create `worker/src/cron/sync-clear-v1-events.ts`

- [ ] **Step 1: Implement**

```ts
import { getLastBlock, setLastBlock } from "../lib/db";
import { batchFetch, MAX_BLOCKS_PER_SYNC } from "../lib/batch-fetch";
import {
  rpcGetBlockTimestampStrict,
  rpcGetLogsMulti,
  rpcGetTipBlock,
  rpcGetTxStrict,
  type RawLog,
} from "../lib/rpc";
import { decodeLog } from "../lib/clear-v1-decode";
import { V1_DEPLOY_BLOCK, V1_EMITTERS } from "@shared/lib/clear-v1-config";

/**
 * Index Clear V1 events into clear_v1_events.
 * Unlike the v0.2 syncs, every failure throws: the cursor must not move past
 * data we did not store, and tracked() must record the failure in cron_health.
 */

const SYNC_KEY = "clear-v1-events";
const CONFIRMATIONS = 12;
const ADDRESS_BATCH = 31; // lower if RouteMesh rejects the list

export async function syncClearV1Events(db: D1Database, rpcUrl: string | null): Promise<void> {
  if (!rpcUrl) throw new Error("[clear-v1-events] ROUTEMESH_RPC_URL missing");

  const stored = await getLastBlock(db, SYNC_KEY);
  const lastBlock = Math.max(stored, V1_DEPLOY_BLOCK - 1);
  const safeTip = (await rpcGetTipBlock(rpcUrl)) - CONFIRMATIONS;
  const fromBlock = lastBlock + 1;
  const toBlock = Math.min(fromBlock + MAX_BLOCKS_PER_SYNC - 1, safeTip);
  if (toBlock < fromBlock) return;

  const logs: RawLog[] = [];
  for (let i = 0; i < V1_EMITTERS.length; i += ADDRESS_BATCH) {
    logs.push(...(await rpcGetLogsMulti(rpcUrl, V1_EMITTERS.slice(i, i + ADDRESS_BATCH), fromBlock, toBlock)));
  }

  const decoded = logs
    .map((log) => ({ log, row: decodeLog(log) }))
    .filter((x): x is { log: RawLog; row: NonNullable<typeof x.row> } => x.row !== null);

  if (decoded.length > 0) {
    const timestamps = new Map<number, number>();
    for (const { log, row } of decoded) {
      if (log.blockTimestamp) timestamps.set(row.block_number, parseInt(log.blockTimestamp, 16));
    }
    const missing = [...new Set(decoded.map((d) => d.row.block_number))].filter((b) => !timestamps.has(b));
    await batchFetch(missing, async (b) => {
      timestamps.set(b, await rpcGetBlockTimestampStrict(rpcUrl, b));
    });

    const txs = new Map<string, { from: string; to: string }>();
    await batchFetch([...new Set(decoded.map((d) => d.row.tx_hash))], async (h) => {
      txs.set(h, await rpcGetTxStrict(rpcUrl, h));
    });

    const stmt = db.prepare(
      `INSERT OR IGNORE INTO clear_v1_events
       (tx_hash, log_index, block_number, timestamp, date, contract, kind, event_name, actor, tx_from, tx_to,
        token_in, token_out, amount_in_raw, amount_out_raw, volume_token, volume_units,
        fee_token, fee_treasury_units, fee_lp_units, fee_trader_units, args_json)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    );
    const stmts = decoded.map(({ row: r }) => {
      const ts = timestamps.get(r.block_number)!;
      const tx = txs.get(r.tx_hash)!;
      return stmt.bind(
        r.tx_hash, r.log_index, r.block_number, ts, new Date(ts * 1000).toISOString().slice(0, 10),
        r.contract, r.kind, r.event_name, r.actor, tx.from, tx.to,
        r.token_in, r.token_out, r.amount_in_raw, r.amount_out_raw, r.volume_token, r.volume_units,
        r.fee_token, r.fee_treasury_units, r.fee_lp_units, r.fee_trader_units, r.args_json,
      );
    });
    for (let i = 0; i < stmts.length; i += 100) await db.batch(stmts.slice(i, i + 100));
  }

  await setLastBlock(db, SYNC_KEY, toBlock);
  console.log(`[clear-v1-events] ${fromBlock}-${toBlock}: ${logs.length} logs, ${decoded.length} stored`);
}
```

- [ ] **Step 2: Test that failure never moves the cursor**

Create `worker/src/lib/__tests__/sync-clear-v1-events.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import fx from "./fixtures/clear-v1-logs.json";

vi.mock("../db", () => ({ getLastBlock: vi.fn(async () => 26_300_000), setLastBlock: vi.fn(async () => {}) }));
vi.mock("../rpc", () => ({
  rpcGetTipBlock: vi.fn(async () => 26_400_000),
  rpcGetLogsMulti: vi.fn(),
  rpcGetTxStrict: vi.fn(),
  rpcGetBlockTimestampStrict: vi.fn(async () => 1_762_000_000),
}));

import { setLastBlock } from "../db";
import { rpcGetLogsMulti, rpcGetTxStrict } from "../rpc";
import { syncClearV1Events } from "../../cron/sync-clear-v1-events";

const db = {
  prepare: () => ({ bind: (...a: unknown[]) => a }),
  batch: vi.fn(async () => []),
} as unknown as D1Database;

beforeEach(() => vi.clearAllMocks());

describe("syncClearV1Events", () => {
  it("does not move the cursor when the log scan fails", async () => {
    vi.mocked(rpcGetLogsMulti).mockRejectedValue(new Error("boom"));
    await expect(syncClearV1Events(db, "u")).rejects.toThrow("boom");
    expect(setLastBlock).not.toHaveBeenCalled();
  });
  it("does not move the cursor when a tx read fails", async () => {
    vi.mocked(rpcGetLogsMulti).mockResolvedValue([fx.iou as never]);
    vi.mocked(rpcGetTxStrict).mockRejectedValue(new Error("no tx"));
    await expect(syncClearV1Events(db, "u")).rejects.toThrow("no tx");
    expect(setLastBlock).not.toHaveBeenCalled();
  });
  it("advances after an empty but successful scan", async () => {
    vi.mocked(rpcGetLogsMulti).mockResolvedValue([]);
    await syncClearV1Events(db, "u");
    expect(setLastBlock).toHaveBeenCalledWith(db, "clear-v1-events", 26_305_000);
  });
});
```

Run: `npx vitest run worker/src/lib/__tests__/sync-clear-v1-events.test.ts`
Expected: PASS.

- [ ] **Step 3: Type-check**

Run: `cd worker && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add worker/src/cron/sync-clear-v1-events.ts worker/src/lib/__tests__/sync-clear-v1-events.test.ts
git commit -m "feat(clear-v1): event sync cron"
```

---

### Task 6: Metrics

**Files:** Create `worker/src/lib/clear-v1-metrics.ts`, test `worker/src/lib/__tests__/clear-v1-metrics.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { computeRevenue, computeRunway, computeTvl, computeVolume, percentile, priceOn, type MetricEvent } from "../clear-v1-metrics";

const BLP = "0xd1b4d7f6f651c13b687a22fc97b718aad3a0e41d";
const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const USDT = "0xdac17f958d2ee523a2206206994597c13d831ec7";

const ev = (o: Partial<MetricEvent>): MetricEvent => ({
  tx_hash: "0x1", date: "2026-11-04", contract: BLP, kind: "swap",
  token_in: null, token_out: null, amount_in_raw: null, amount_out_raw: null,
  volume_token: USDC, volume_units: 0,
  fee_token: USDC, fee_treasury_units: null, fee_lp_units: null, fee_trader_units: null, ...o,
});

describe("computeTvl", () => {
  it("reproduces the live example and does not double count bLP", () => {
    const t = computeTvl([
      { kind: "base", grossPar: 6249, nativeValue: null, iouDebtPar: 249 },
      { kind: "meta", grossPar: 1678.92, nativeValue: 553.43, iouDebtPar: 249.1 },
      { kind: "meta", grossPar: 1678.92, nativeValue: 553.43, iouDebtPar: 249.1 },
      { kind: "meta", grossPar: 1678.92, nativeValue: 553.44, iouDebtPar: 249.09 },
    ]);
    expect(t.grossTvl).toBeCloseTo(7909.3, 1);
    expect(t.iouDebt).toBeCloseTo(996.29, 1);
    expect(t.netTvl).toBeCloseTo(6913.01, 1);
    expect(t.partial).toBe(false);
  });
  it("returns null, not a wrong number, when a leg is unavailable", () => {
    const t = computeTvl([
      { kind: "base", grossPar: 6249, nativeValue: null, iouDebtPar: 249 },
      { kind: "meta", grossPar: null, nativeValue: null, iouDebtPar: null },
    ]);
    expect(t.grossTvl).toBeNull();
    expect(t.partial).toBe(true);
  });
});

describe("priceOn", () => {
  const prices = new Map([["2026-11-01", 1.0005], ["2026-11-03", 1.0008]]);
  it("prices stables at par", () => expect(priceOn(USDC, "2026-11-04", prices)).toBe(1));
  it("uses the exact date", () => expect(priceOn(BLP, "2026-11-03", prices)).toBe(1.0008));
  it("falls back to the nearest date", () => expect(priceOn(BLP, "2026-11-02", prices)).toBe(1.0005));
  it("uses par when no snapshot exists", () => expect(priceOn(BLP, "2026-11-04", new Map())).toBe(1));
});

describe("computeVolume", () => {
  it("counts a routed two-leg swap once, and twice per reserve leg", () => {
    const v = computeVolume([
      ev({ tx_hash: "0xa", volume_units: 100 }),
      ev({ tx_hash: "0xa", volume_units: 99 }),
      ev({ tx_hash: "0xb", volume_units: 50 }),
    ], new Map());
    expect(v.swapVolume).toBe(150);
    expect(v.reserveLegVolume).toBe(249);
  });
});

describe("computeRevenue", () => {
  it("routes each fee to its line", () => {
    const r = computeRevenue([
      ev({ fee_treasury_units: 1, fee_lp_units: 2, fee_trader_units: 3 }),
      ev({ kind: "flash_loan", fee_lp_units: 4 }),
      ev({ kind: "deposit", fee_treasury_units: 5 }),
    ], new Map());
    expect(r.swapTreasury).toBe(1);
    expect(r.swapLp).toBe(2);
    expect(r.traderRebate).toBe(3);
    expect(r.flashLp).toBe(4);
    expect(r.singleAssetTreasury).toBe(5);
    expect(r.total).toBe(12);
  });
  it("prices a bLP fee as bLP", () => {
    const r = computeRevenue([ev({ fee_token: BLP, fee_treasury_units: 100 })], new Map([["2026-11-04", 1.001]]));
    expect(r.swapTreasury).toBeCloseTo(100.1, 6);
  });
  it("counts rebalance result on Base only", () => {
    const base = ev({ kind: "rebalance", token_in: USDC, token_out: USDT, amount_in_raw: "1000000", amount_out_raw: "999000" });
    const meta = ev({ ...base, contract: "0x4ff500233d1898ae2ac5ad61296780ba35dcaed4" });
    expect(computeRevenue([base, meta], new Map()).rebalanceResult).toBeCloseTo(0.001, 6);
  });
});

describe("percentile", () => {
  it("is null with no data", () => expect(percentile([], 0.95)).toBeNull());
  it("picks the high end", () => expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.95)).toBe(10));
});

describe("computeRunway", () => {
  it("needs 3 days of data", () => expect(computeRunway(1, 0.1, 2)).toBeNull());
  it("divides balance by daily spend", () => expect(computeRunway(1, 0.1, 7)).toBe(10));
  it("is null with no spend", () => expect(computeRunway(1, 0, 7)).toBeNull());
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run worker/src/lib/__tests__/clear-v1-metrics.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```ts
import { V1_BASE_RESERVE, V1_TOKENS } from "@shared/lib/clear-v1-config";

export interface MetricEvent {
  tx_hash: string;
  date: string;
  contract: string;
  kind: string;
  token_in: string | null;
  token_out: string | null;
  amount_in_raw: string | null;
  amount_out_raw: string | null;
  volume_token: string | null;
  volume_units: number | null;
  fee_token: string | null;
  fee_treasury_units: number | null;
  fee_lp_units: number | null;
  fee_trader_units: number | null;
}

/** date -> bLP redemption price. All figures are at par: stablecoins count $1. */
export type BlpPrices = Map<string, number>;

export function priceOn(token: string | null, date: string, prices: BlpPrices): number {
  if (token !== V1_BASE_RESERVE) return 1;
  const exact = prices.get(date);
  if (exact !== undefined) return exact;
  const dates = [...prices.keys()].sort();
  if (dates.length === 0) return 1;
  const before = dates.filter((d) => d <= date).pop();
  return prices.get(before ?? dates[0])!;
}

export interface TvlLeg {
  kind: "base" | "meta";
  grossPar: number | null;
  nativeValue: number | null;
  iouDebtPar: number | null;
}

/** Base gross plus Meta native legs. Meta gross is excluded: it includes bLP already counted in Base. */
export function computeTvl(legs: TvlLeg[]) {
  const held = legs.map((l) => (l.kind === "base" ? l.grossPar : l.nativeValue));
  const debts = legs.map((l) => l.iouDebtPar);
  if (held.some((v) => v === null) || debts.some((v) => v === null)) {
    return { grossTvl: null, iouDebt: null, netTvl: null, partial: true };
  }
  const grossTvl = (held as number[]).reduce((a, b) => a + b, 0);
  const iouDebt = (debts as number[]).reduce((a, b) => a + b, 0);
  return { grossTvl, iouDebt, netTvl: grossTvl - iouDebt, partial: false };
}

export function computeVolume(swaps: MetricEvent[], prices: BlpPrices) {
  const perTx = new Map<string, number>();
  let reserveLegVolume = 0;
  for (const s of swaps) {
    const usd = (s.volume_units ?? 0) * priceOn(s.volume_token, s.date, prices);
    reserveLegVolume += usd;
    perTx.set(s.tx_hash, Math.max(perTx.get(s.tx_hash) ?? 0, usd));
  }
  return { swapVolume: [...perTx.values()].reduce((a, b) => a + b, 0), reserveLegVolume };
}

const rawUnits = (raw: string | null, token: string | null): number => {
  const decimals = token ? V1_TOKENS[token]?.decimals : undefined;
  return raw && decimals !== undefined ? Number(raw) / 10 ** decimals : 0;
};

export function computeRevenue(events: MetricEvent[], prices: BlpPrices) {
  const r = { swapTreasury: 0, swapLp: 0, traderRebate: 0, singleAssetTreasury: 0, flashLp: 0, rebalanceResult: 0 };
  for (const e of events) {
    const p = priceOn(e.fee_token, e.date, prices);
    if (e.kind === "swap") {
      r.swapTreasury += (e.fee_treasury_units ?? 0) * p;
      r.swapLp += (e.fee_lp_units ?? 0) * p;
      r.traderRebate += (e.fee_trader_units ?? 0) * p;
    } else if (e.kind === "flash_loan") {
      r.flashLp += (e.fee_lp_units ?? 0) * p;
    } else if (e.kind === "deposit" || e.kind === "withdraw") {
      r.singleAssetTreasury += (e.fee_treasury_units ?? 0) * p;
    } else if (e.kind === "rebalance" && e.contract === V1_BASE_RESERVE) {
      // Meta rebalances are NAV-neutral on redemption basis, so only Base moves par NAV.
      r.rebalanceResult += rawUnits(e.amount_in_raw, e.token_in) - rawUnits(e.amount_out_raw, e.token_out);
    }
  }
  // The trader rebate is paid out, so it is not revenue.
  return { ...r, total: r.swapTreasury + r.swapLp + r.singleAssetTreasury + r.flashLp };
}

export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

const MIN_RUNWAY_DAYS = 3;

export function computeRunway(balanceEth: number, dailyEth: number, daysOfData: number): number | null {
  if (daysOfData < MIN_RUNWAY_DAYS || dailyEth <= 0) return null;
  return balanceEth / dailyEth;
}
```

- [ ] **Step 4: Run it**

Run: `npx vitest run worker/src/lib/__tests__/clear-v1-metrics.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add worker/src/lib/clear-v1-metrics.ts worker/src/lib/__tests__/clear-v1-metrics.test.ts
git commit -m "feat(clear-v1): valuation, TVL, volume, revenue, runway"
```

---

### Task 7: State cron

**Files:** Create `worker/src/cron/sync-clear-v1-state.ts`

- [ ] **Step 1: Implement**

```ts
import { decodeFunctionResult, encodeFunctionData, formatUnits, parseAbi, type Hex } from "viem";
import { setCache } from "../lib/db";
import { rpcEthCall } from "../lib/rpc";
import {
  V1_BASE_RESERVE, V1_FEEDS, V1_GAS_WATCHLIST, V1_ORACLE, V1_POOLS, V1_RESERVES, V1_TOKENS,
} from "@shared/lib/clear-v1-config";

/**
 * Every 15 min: one Multicall3 read into cache row "clear-v1-state", plus an upsert of
 * today's clear_v1_snapshots. Meta value reads revert when the oracle is stale, so each
 * sub-call may fail on its own: its field becomes null and the rest of the row still lands.
 */

const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";
export const STATE_CACHE_KEY = "clear-v1-state";
const ONE = 10n ** 18n;

const ABI = parseAbi([
  "function aggregate3((address target, bool allowFailure, bytes callData)[] calls) view returns ((bool success, bytes returnData)[])",
  "function getEthBalance(address addr) view returns (uint256)",
  "function totalAssets() view returns (uint256)",
  "function baseLpValue() view returns (uint256)",
  "function nativeValue() view returns (uint256)",
  "function totalIOUDebt() view returns (uint256)",
  "function totalReserveValue() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function paused() view returns (bool)",
  "function rebalanceNeeded() view returns (bool)",
  "function swapSpreadMinBps() view returns (uint256)",
  "function swapSpreadMaxBps() view returns (uint256)",
  "function baseQuoteFeeBps() view returns (uint256)",
  "function singleAssetFeeBps() view returns (uint256)",
  "function flashFeeBps() view returns (uint256)",
  "function convertToRedemptionValue(uint256 shares) view returns (uint256)",
  "function balances(uint256 i) view returns (uint256)",
  "function admin_balances(uint256 i) view returns (uint256)",
  "function oracleConfiguration(address asset) view returns (bool enabled, uint8 assetDecimals, uint8 oracleDecimals, uint256 redemptionPrice, uint256 priceTTL, uint256 lastUpdateTimestamp, uint256 price)",
]);

type Fn = (typeof ABI)[number]["name"];

interface Call {
  target: string;
  fn: Fn;
  args?: readonly unknown[];
}

async function multicall(rpcUrl: string, calls: Call[]): Promise<(unknown | null)[]> {
  const data = encodeFunctionData({
    abi: ABI,
    functionName: "aggregate3",
    args: [calls.map((c) => ({
      target: c.target as Hex,
      allowFailure: true,
      callData: encodeFunctionData({ abi: ABI, functionName: c.fn, args: c.args ?? [] } as never),
    }))],
  });
  const raw = await rpcEthCall(rpcUrl, MULTICALL3, data);
  const results = decodeFunctionResult({ abi: ABI, functionName: "aggregate3", data: raw as Hex }) as readonly {
    success: boolean;
    returnData: Hex;
  }[];
  return results.map((r, i) =>
    r.success
      ? decodeFunctionResult({ abi: ABI, functionName: calls[i].fn, data: r.returnData } as never)
      : null
  );
}

const par = (v: unknown): number | null => (typeof v === "bigint" ? Number(formatUnits(v, 18)) : null);
const num = (v: unknown): number | null => (typeof v === "bigint" ? Number(v) : null);
const units = (v: unknown, token: string): number | null =>
  typeof v === "bigint" ? Number(formatUnits(v, V1_TOKENS[token].decimals)) : null;

// Drops null fields so json_patch keeps the last good value instead of deleting it.
const compact = (v: unknown) => JSON.stringify(v, (_k, x) => (x === null ? undefined : x));

export interface V1State {
  updatedAt: number;
  blpRedemptionPrice: number | null;
  reserves: {
    address: string; label: string; kind: "base" | "meta";
    grossPar: number | null; netPar: number | null; iouDebtPar: number | null;
    nativeValue: number | null; baseLpValue: number | null; supply: number | null;
    paused: boolean | null; rebalanceNeeded: boolean | null;
    params: Record<string, number | null>;
  }[];
  pools: { address: string; label: string; coins: string[]; balances: (number | null)[]; adminBalances: (number | null)[] }[];
  feeds: { asset: string; symbol: string; lastUpdate: number | null; ttl: number | null; price: number | null }[];
  wallets: { address: string; label: string; balanceEth: number | null }[];
}

export async function syncClearV1State(db: D1Database, rpcUrl: string | null): Promise<void> {
  if (!rpcUrl) throw new Error("[clear-v1-state] ROUTEMESH_RPC_URL missing");

  const RESERVE_FNS: Fn[] = [
    "totalIOUDebt", "totalReserveValue", "totalSupply", "paused", "rebalanceNeeded",
    "swapSpreadMinBps", "swapSpreadMaxBps", "baseQuoteFeeBps", "singleAssetFeeBps", "flashFeeBps",
  ];
  const calls: Call[] = [];
  const at = new Map<string, number>();
  const add = (key: string, c: Call) => { at.set(key, calls.length); calls.push(c); };

  for (const r of V1_RESERVES) {
    for (const fn of RESERVE_FNS) add(`${r.address}:${fn}`, { target: r.address, fn });
    if (r.kind === "base") {
      add(`${r.address}:totalAssets`, { target: r.address, fn: "totalAssets" });
    } else {
      add(`${r.address}:nativeValue`, { target: r.address, fn: "nativeValue" });
      add(`${r.address}:baseLpValue`, { target: r.address, fn: "baseLpValue" });
    }
  }
  add("blp", { target: V1_BASE_RESERVE, fn: "convertToRedemptionValue", args: [ONE] });
  for (const p of V1_POOLS) {
    for (const i of [0n, 1n]) {
      add(`${p.address}:balances:${i}`, { target: p.address, fn: "balances", args: [i] });
      add(`${p.address}:admin:${i}`, { target: p.address, fn: "admin_balances", args: [i] });
    }
  }
  for (const f of V1_FEEDS) add(`feed:${f}`, { target: V1_ORACLE, fn: "oracleConfiguration", args: [f] });
  for (const w of V1_GAS_WATCHLIST) add(`eth:${w.address}`, { target: MULTICALL3, fn: "getEthBalance", args: [w.address] });

  const results = await multicall(rpcUrl, calls); // a total failure throws; the previous row stays
  const get = (key: string) => results[at.get(key)!];

  const state: V1State = {
    updatedAt: Math.floor(Date.now() / 1000),
    blpRedemptionPrice: par(get("blp")),
    reserves: V1_RESERVES.map((r) => {
      const k = (fn: string) => get(`${r.address}:${fn}`);
      const nativeValue = r.kind === "meta" ? par(k("nativeValue")) : null;
      const baseLpValue = r.kind === "meta" ? par(k("baseLpValue")) : null;
      const grossPar = r.kind === "base"
        ? par(k("totalAssets"))
        : nativeValue !== null && baseLpValue !== null ? nativeValue + baseLpValue : null;
      return {
        address: r.address, label: r.label, kind: r.kind,
        grossPar, netPar: par(k("totalReserveValue")), iouDebtPar: par(k("totalIOUDebt")),
        nativeValue, baseLpValue, supply: par(k("totalSupply")),
        paused: k("paused") as boolean | null,
        rebalanceNeeded: k("rebalanceNeeded") as boolean | null,
        params: {
          swapSpreadMinBps: num(k("swapSpreadMinBps")),
          swapSpreadMaxBps: num(k("swapSpreadMaxBps")),
          baseQuoteFeeBps: num(k("baseQuoteFeeBps")),
          singleAssetFeeBps: num(k("singleAssetFeeBps")),
          flashFeeBps: num(k("flashFeeBps")),
        },
      };
    }),
    pools: V1_POOLS.map((p) => ({
      address: p.address, label: p.label, coins: p.coins,
      balances: [0, 1].map((i) => units(get(`${p.address}:balances:${i}`), p.coins[i])),
      adminBalances: [0, 1].map((i) => units(get(`${p.address}:admin:${i}`), p.coins[i])),
    })),
    feeds: V1_FEEDS.map((asset) => {
      const c = get(`feed:${asset}`) as readonly [boolean, number, number, bigint, bigint, bigint, bigint] | null;
      return {
        asset, symbol: V1_TOKENS[asset].symbol,
        lastUpdate: c ? Number(c[5]) : null,
        ttl: c ? Number(c[4]) : null,
        price: c ? Number(c[6]) / 10 ** c[2] : null,
      };
    }),
    wallets: V1_GAS_WATCHLIST.map((w) => ({
      address: w.address, label: w.label, balanceEth: par(get(`eth:${w.address}`)),
    })),
  };

  await setCache(db, STATE_CACHE_KEY, JSON.stringify(state));

  const date = new Date().toISOString().slice(0, 10);
  const contracts = [
    ...state.reserves.map((r) => ({
      contract: r.address, gross: r.grossPar, net: r.netPar, debt: r.iouDebtPar,
      blp: r.address === V1_BASE_RESERVE ? state.blpRedemptionPrice : null,
      json: compact({ nativeValue: r.nativeValue, baseLpValue: r.baseLpValue, supply: r.supply, params: r.params }),
    })),
    ...state.pools.map((p) => ({
      contract: p.address, gross: null, net: null, debt: null, blp: null,
      json: compact({ balances: p.balances, adminBalances: p.adminBalances }),
    })),
  ];
  const upsert = db.prepare(
    `INSERT INTO clear_v1_snapshots (date, contract, gross_par, net_par, iou_debt_par, blp_redemption_price, state_json)
     VALUES (?,?,?,?,?,?,?)
     ON CONFLICT(date, contract) DO UPDATE SET
       gross_par = COALESCE(excluded.gross_par, gross_par),
       net_par = COALESCE(excluded.net_par, net_par),
       iou_debt_par = COALESCE(excluded.iou_debt_par, iou_debt_par),
       blp_redemption_price = COALESCE(excluded.blp_redemption_price, blp_redemption_price),
       state_json = json_patch(state_json, excluded.state_json)`
  );
  await db.batch(contracts.map((c) => upsert.bind(date, c.contract, c.gross, c.net, c.debt, c.blp, c.json)));
}
```

This upserts 16 rows every 15 minutes, about 1,500 a day, still far below the D1 budget and simpler than a once-a-day branch.

Curve `balances(i)` and `admin_balances(i)` take `uint256`. Multicall's `getEthBalance` must be called on `MULTICALL3` itself, as above.

- [ ] **Step 2: Type-check**

Run: `cd worker && npx tsc --noEmit`
Expected: no errors. If viem's generics reject the `as never` casts, narrow them, do not widen to `any`.

- [ ] **Step 3: Commit**

```bash
git add worker/src/cron/sync-clear-v1-state.ts
git commit -m "feat(clear-v1): live state and daily snapshots"
```

---

### Task 8: Gas cron

**Files:** Create `worker/src/cron/sync-clear-v1-gas.ts`, test `worker/src/lib/__tests__/clear-v1-gas.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { parseTxlist } from "../../cron/sync-clear-v1-gas";

const W = "0xbc9d0f94ffc516f9b5e87a8480156b8d12332b43";
const tx = (o: object) => ({
  hash: "0x1", from: W, to: "0x2", blockNumber: "10", timeStamp: "1762000000",
  gasUsed: "400000", gasPrice: "1000000000", value: "0", isError: "0", ...o,
});

describe("parseTxlist", () => {
  it("treats No transactions found as empty", () => {
    expect(parseTxlist({ status: "0", message: "No transactions found", result: [] }, W)).toEqual([]);
  });
  it("throws on NOTOK", () => {
    expect(() => parseTxlist({ status: "0", message: "NOTOK", result: "rate limit" }, W)).toThrow(/NOTOK/);
  });
  it("excludes incoming top-ups", () => {
    const r = parseTxlist({ status: "1", message: "OK", result: [tx({ from: "0xfeed" })] }, W);
    expect(r).toEqual([]);
  });
  it("computes cost and keeps failed txs", () => {
    const [r] = parseTxlist({ status: "1", message: "OK", result: [tx({ isError: "1" })] }, W);
    expect(r.failed).toBe(1);
    expect(r.gas_cost_eth).toBeCloseTo(0.0004, 8);
    expect(r.gas_price_gwei).toBe(1);
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run worker/src/lib/__tests__/clear-v1-gas.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```ts
import { getLastBlock, setLastBlock } from "../lib/db";
import { fetchEthPrice } from "../lib/rpc";
import { V1_DEPLOY_BLOCK, V1_GAS_WATCHLIST } from "@shared/lib/clear-v1-config";

/**
 * Gas per watched wallet from Etherscan txlist, not from event receipts: a reverted
 * keeper tx emits no logs but still burns gas. The cursor sits on the last stored tx,
 * never on the tip, so an Etherscan lag cannot lose a tx. tx_hash dedupes the overlap.
 */

const PAGE_SIZE = 1000;

interface EtherscanTx {
  hash: string; from: string; to: string; blockNumber: string; timeStamp: string;
  gasUsed: string; gasPrice: string; value: string; isError: string;
}

interface EtherscanResponse {
  status: string;
  message: string;
  result: EtherscanTx[] | string;
}

export function parseTxlist(resp: EtherscanResponse, wallet: string) {
  if (resp.status !== "1") {
    if (resp.message === "No transactions found") return [];
    throw new Error(`[clear-v1-gas] Etherscan ${resp.message}: ${String(resp.result).slice(0, 120)}`);
  }
  return (resp.result as EtherscanTx[])
    .filter((t) => t.from.toLowerCase() === wallet)
    .map((t) => ({
      tx_hash: t.hash,
      tx_to: t.to.toLowerCase(),
      block_number: Number(t.blockNumber),
      timestamp: Number(t.timeStamp),
      failed: t.isError === "1" ? 1 : 0,
      gas_used: Number(t.gasUsed),
      gas_price_gwei: Number(t.gasPrice) / 1e9,
      gas_cost_eth: (Number(t.gasUsed) * Number(t.gasPrice)) / 1e18,
      value_eth: Number(t.value) / 1e18,
    }));
}

async function fetchPage(wallet: string, startBlock: number, page: number, key: string): Promise<EtherscanResponse> {
  const url =
    `https://api.etherscan.io/v2/api?chainid=1&module=account&action=txlist&address=${wallet}` +
    `&startblock=${startBlock}&endblock=99999999&page=${page}&offset=${PAGE_SIZE}&sort=asc&apikey=${key}`;
  const resp = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!resp.ok) throw new Error(`[clear-v1-gas] Etherscan HTTP ${resp.status}`);
  return resp.json();
}

export async function syncClearV1Gas(db: D1Database, etherscanKey: string | null): Promise<void> {
  if (!etherscanKey) throw new Error("[clear-v1-gas] ETHERSCAN_API_KEY missing");
  const ethPrice = await fetchEthPrice(etherscanKey);

  const stmt = db.prepare(
    `INSERT OR IGNORE INTO clear_v1_gas_txs
     (tx_hash, wallet, label, category, tx_to, block_number, timestamp, date, failed,
      gas_used, gas_price_gwei, gas_cost_eth, value_eth, gas_cost_usd)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  );

  for (const w of V1_GAS_WATCHLIST) {
    const cursorKey = `clear-v1-gas:${w.address}`;
    const start = Math.max(await getLastBlock(db, cursorKey), V1_DEPLOY_BLOCK);
    let last = start;

    for (let page = 1; ; page++) {
      const resp = await fetchPage(w.address, start, page, etherscanKey);
      const rows = parseTxlist(resp, w.address);
      if (rows.length > 0) {
        await db.batch(rows.map((r) => stmt.bind(
          r.tx_hash, w.address, w.label, w.category, r.tx_to, r.block_number, r.timestamp,
          new Date(r.timestamp * 1000).toISOString().slice(0, 10), r.failed, r.gas_used,
          r.gas_price_gwei, r.gas_cost_eth, r.value_eth, ethPrice ? r.gas_cost_eth * ethPrice : null,
        )));
        last = Math.max(last, ...rows.map((r) => r.block_number));
      }
      const fetched = Array.isArray(resp.result) ? resp.result.length : 0;
      if (fetched < PAGE_SIZE) break;
    }

    if (last > start) await setLastBlock(db, cursorKey, last);
  }
}
```

- [ ] **Step 4: Run it**

Run: `npx vitest run worker/src/lib/__tests__/clear-v1-gas.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add worker/src/cron/sync-clear-v1-gas.ts worker/src/lib/__tests__/clear-v1-gas.test.ts
git commit -m "feat(clear-v1): gas per watched wallet, including reverted txs"
```

---

### Task 9: API and wiring

**Files:** Create `worker/src/api/clear-v1.ts`; modify `worker/src/router.ts`, `worker/src/index.ts`

- [ ] **Step 1: Implement the endpoints**

```ts
import { getCache } from "../lib/db";
import { computeRevenue, computeRunway, computeTvl, computeVolume, percentile, type BlpPrices, type MetricEvent } from "../lib/clear-v1-metrics";
import { STATE_CACHE_KEY, type V1State } from "../cron/sync-clear-v1-state";
import { V1_GAS_WATCHLIST, V1_POOLS, V1_RESERVES } from "@shared/lib/clear-v1-config";

const PERIODS = [1, 7, 30];
const ok = (body: unknown) =>
  new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json", "Cache-Control": "public, s-maxage=60, max-age=60" },
  });
const fail = (where: string, err: unknown) => {
  console.error(`[${where}] failed:`, err);
  return new Response(JSON.stringify({ error: "Internal server error" }), {
    status: 500, headers: { "Content-Type": "application/json" },
  });
};
// First date of an N-day window ending today: 1 means today only.
const sinceDate = (days: number) => new Date(Date.now() - (days - 1) * 86_400_000).toISOString().slice(0, 10);

export async function handleClearV1Overview(db: D1Database): Promise<Response> {
  try {
    const cached = await getCache(db, STATE_CACHE_KEY);
    const state = cached ? (JSON.parse(cached.value) as V1State) : null;

    const [priceRows, eventRows, tvlRows] = await Promise.all([
      db.prepare("SELECT date, blp_redemption_price p FROM clear_v1_snapshots WHERE blp_redemption_price IS NOT NULL")
        .all<{ date: string; p: number }>(),
      db.prepare(
        `SELECT tx_hash, date, contract, kind, tx_to, token_in, token_out, amount_in_raw, amount_out_raw,
                volume_token, volume_units, fee_token, fee_treasury_units, fee_lp_units, fee_trader_units
         FROM clear_v1_events
         WHERE date >= ? AND kind IN ('swap','rebalance','flash_loan','deposit','withdraw','pool_swap')`
      ).bind(sinceDate(30)).all<MetricEvent & { tx_to: string | null }>(),
      db.prepare("SELECT date, contract, gross_par, iou_debt_par, state_json FROM clear_v1_snapshots ORDER BY date")
        .all<{ date: string; contract: string; gross_par: number | null; iou_debt_par: number | null; state_json: string }>(),
    ]);

    const prices: BlpPrices = new Map(priceRows.results.map((r) => [r.date, r.p]));
    const events = eventRows.results;

    const periods = PERIODS.map((days) => {
      const since = sinceDate(days);
      const inWindow = events.filter((e) => e.date >= since);
      const swaps = inWindow.filter((e) => e.kind === "swap");
      return {
        days,
        ...computeVolume(swaps, prices),
        poolVolume: computeVolume(inWindow.filter((e) => e.kind === "pool_swap"), prices).reserveLegVolume,
        swapCount: new Set(swaps.map((s) => s.tx_hash)).size,
        rebalanceCount: inWindow.filter((e) => e.kind === "rebalance").length,
        revenue: computeRevenue(inWindow, prices),
      };
    });

    const last7 = events.filter((e) => e.date >= sinceDate(7));
    const swaps7 = last7.filter((e) => e.kind === "swap");
    const pools7 = last7.filter((e) => e.kind === "pool_swap");

    const reserveVolume7d = V1_RESERVES.map((r) => ({
      address: r.address,
      volume: computeVolume(swaps7.filter((e) => e.contract === r.address), prices).reserveLegVolume,
    }));
    const poolVolume7d = V1_POOLS.map((p) => ({
      address: p.address,
      volume: computeVolume(pools7.filter((e) => e.contract === p.address), prices).reserveLegVolume,
    }));
    const entryPoints = [...new Set(pools7.map((e) => e.tx_to ?? "unknown"))].map((entry) => {
      const rows = pools7.filter((e) => (e.tx_to ?? "unknown") === entry);
      return { entry, swaps: rows.length, volume: computeVolume(rows, prices).reserveLegVolume };
    });
    const daily = [...new Set(events.map((e) => e.date))].sort().map((date) => {
      const day = events.filter((e) => e.date === date);
      return {
        date,
        swapVolume: computeVolume(day.filter((e) => e.kind === "swap"), prices).swapVolume,
        revenue: computeRevenue(day, prices).total,
      };
    });

    const tvl = state
      ? computeTvl(state.reserves)
      : { grossTvl: null, iouDebt: null, netTvl: null, partial: true };
    const curveAdminPending = state
      ? state.pools.flatMap((p) => p.adminBalances).reduce<number>((a, b) => a + (b ?? 0), 0)
      : null;

    const reserveKind = new Map(V1_RESERVES.map((r) => [r.address, r.kind]));
    const reserveRows = tvlRows.results.filter((r) => reserveKind.has(r.contract));
    const dailyTvl = [...new Set(reserveRows.map((r) => r.date))].map((date) => {
      const t = computeTvl(reserveRows.filter((r) => r.date === date).map((r) => ({
        kind: reserveKind.get(r.contract)!,
        grossPar: r.gross_par,
        nativeValue: (JSON.parse(r.state_json) as { nativeValue?: number }).nativeValue ?? null,
        iouDebtPar: r.iou_debt_par,
      })));
      return { date, grossTvl: t.grossTvl, netTvl: t.netTvl };
    });

    const known = new Set(V1_RESERVES.map((r) => r.address));
    const created = await db
      .prepare("SELECT args_json FROM clear_v1_events WHERE event_name = 'NewClearReserve'")
      .all<{ args_json: string }>();
    const unknownReserves = created.results
      .map((r) => (JSON.parse(r.args_json) as { reserve: string }).reserve.toLowerCase())
      .filter((a) => !known.has(a));

    return ok({ state, tvl, curveAdminPending, periods, reserveVolume7d, poolVolume7d, entryPoints, daily, dailyTvl, unknownReserves, updatedAt: state?.updatedAt ?? null });
  } catch (err) {
    return fail("clear-v1-overview", err);
  }
}

export async function handleClearV1Activity(db: D1Database, url: URL): Promise<Response> {
  try {
    const kind = url.searchParams.get("kind");
    const contract = url.searchParams.get("contract")?.toLowerCase();
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 50) || 50, 200);
    const offset = Number(url.searchParams.get("offset") ?? 0) || 0;
    const where: string[] = [];
    const binds: (string | number)[] = [];
    if (kind) { where.push("kind = ?"); binds.push(kind); }
    if (contract) { where.push("contract = ?"); binds.push(contract); }
    const sql =
      `SELECT tx_hash, log_index, block_number, timestamp, contract, kind, event_name, actor, tx_from, tx_to,
              token_in, token_out, volume_token, volume_units
       FROM clear_v1_events ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY block_number DESC, log_index DESC LIMIT ? OFFSET ?`;
    const rows = await db.prepare(sql).bind(...binds, limit, offset).all();
    return ok({ events: rows.results });
  } catch (err) {
    return fail("clear-v1-activity", err);
  }
}

export async function handleClearV1Gas(db: D1Database): Promise<Response> {
  try {
    const cached = await getCache(db, STATE_CACHE_KEY);
    const state = cached ? (JSON.parse(cached.value) as V1State) : null;
    const rows = await db
      .prepare(
        `SELECT wallet, date, COUNT(*) txs, SUM(failed) failed, SUM(gas_cost_eth) gas_eth,
                SUM(value_eth) value_eth, SUM(gas_cost_usd) gas_usd
         FROM clear_v1_gas_txs WHERE date >= ? GROUP BY wallet, date ORDER BY date`
      )
      .bind(sinceDate(30))
      .all<{ wallet: string; date: string; txs: number; failed: number; gas_eth: number; value_eth: number; gas_usd: number | null }>();

    const txPrices = await db
      .prepare("SELECT wallet, gas_price_gwei p FROM clear_v1_gas_txs WHERE date >= ?")
      .bind(sinceDate(30))
      .all<{ wallet: string; p: number }>();

    const wallets = V1_GAS_WATCHLIST.map((w) => {
      const days = rows.results.filter((r) => r.wallet === w.address);
      const window = (n: number) => days.filter((d) => d.date >= sinceDate(n));
      const sum = (ds: typeof days, f: (d: (typeof days)[number]) => number) => ds.reduce((a, d) => a + f(d), 0);
      const last7 = window(7);
      // Calendar days since the first tx, so quiet days count as zero spend.
      const span = days.length ? Math.floor((Date.now() - Date.parse(days[0].date)) / 86_400_000) + 1 : 0;
      const dailyEth = span ? sum(last7, (d) => d.gas_eth + d.value_eth) / Math.min(7, span) : 0;
      const balanceEth = state?.wallets.find((x) => x.address === w.address)?.balanceEth ?? null;
      const gwei = txPrices.results.filter((t) => t.wallet === w.address).map((t) => t.p);
      const avgGwei = gwei.reduce((a, b) => a + b, 0) / (gwei.length || 1);
      const p95Gwei = percentile(gwei, 0.95);
      return {
        ...w,
        balanceEth,
        runwayDays: balanceEth === null ? null : computeRunway(balanceEth, dailyEth, span),
        runwayDaysAtP95Gas: balanceEth === null || p95Gwei === null || avgGwei === 0
          ? null
          : computeRunway(balanceEth, dailyEth * (p95Gwei / avgGwei), span),
        spend: [1, 7, 30].map((n) => {
          const ds = window(n);
          return {
            days: n,
            eth: sum(ds, (d) => d.gas_eth + d.value_eth),
            usd: sum(ds, (d) => d.gas_usd ?? 0),
            txs: sum(ds, (d) => d.txs),
            failed: sum(ds, (d) => d.failed),
          };
        }),
        daily: days.map((d) => ({ date: d.date, eth: d.gas_eth + d.value_eth, txs: d.txs })),
      };
    });
    return ok({ wallets, updatedAt: state?.updatedAt ?? null });
  } catch (err) {
    return fail("clear-v1-gas", err);
  }
}
```

- [ ] **Step 2: Wire the router**

In `worker/src/router.ts`, add the import and three routes after `/api/clear-regime`:

```ts
import { handleClearV1Activity, handleClearV1Gas, handleClearV1Overview } from "./api/clear-v1";
```
```ts
  "/api/clear-v1-overview": (c) => handleClearV1Overview(c.db),
  "/api/clear-v1-activity": (c) => handleClearV1Activity(c.db, c.url),
  "/api/clear-v1-gas": (c) => handleClearV1Gas(c.db),
```

- [ ] **Step 3: Wire the crons**

In `worker/src/index.ts`, add imports, then in the `"*/5 * * * *"` case:

```ts
ctx.waitUntil(tracked("sync-clear-v1-events", () => syncClearV1Events(env.DB, env.ROUTEMESH_RPC_URL ?? null)));
```

and in the `"*/15 * * * *"` case:

```ts
ctx.waitUntil(tracked("sync-clear-v1-state", () => syncClearV1State(env.DB, env.ROUTEMESH_RPC_URL ?? null)));
ctx.waitUntil(tracked("sync-clear-v1-gas", () => syncClearV1Gas(env.DB, env.ETHERSCAN_API_KEY ?? null)));
```

- [ ] **Step 4: Type-check and test**

Run: `cd worker && npx tsc --noEmit && cd .. && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add worker/src/api/clear-v1.ts worker/src/router.ts worker/src/index.ts worker/src/lib
git commit -m "feat(clear-v1): API endpoints and cron wiring"
```

---

### Task 10: Frontend

**Files:** Create `src/hooks/use-clear-v1.ts`, `src/components/clear-protocol/v1/clear-v1-panel.tsx`, `reserves-table.tsx`, `pools-table.tsx`, `oracle-feeds.tsx`, `gas-table.tsx`, `activity-feed.tsx`; modify `src/components/homepage-client.tsx:227`

Follow @frontend-design only if the existing panel's look does not cover a need. Reuse `KPICard` (`../kpi-card`), `Card` from `@/components/ui/card`, `Table` from `@/components/ui/table`, and `formatUSD`, `formatAge`, `formatRunway` from `../format`.

- [ ] **Step 1: Hooks**

```ts
"use client";

import { useQuery } from "@tanstack/react-query";
import { API_BASE } from "@/lib/api";

async function get<T>(path: string): Promise<T> {
  const resp = await fetch(`${API_BASE}${path}`);
  if (!resp.ok) throw new Error(`${path} API error: ${resp.status}`);
  return resp.json();
}

const POLL = { staleTime: 60_000, refetchInterval: 5 * 60_000 };

export const useClearV1Overview = () =>
  useQuery({ queryKey: ["clear-v1-overview"], queryFn: () => get<ClearV1Overview>("/api/clear-v1-overview"), ...POLL });

export const useClearV1Gas = () =>
  useQuery({ queryKey: ["clear-v1-gas"], queryFn: () => get<ClearV1Gas>("/api/clear-v1-gas"), ...POLL });

export const useClearV1Activity = (kind: string | null) =>
  useQuery({
    queryKey: ["clear-v1-activity", kind],
    queryFn: () => get<{ events: ClearV1Event[] }>(`/api/clear-v1-activity?limit=50${kind ? `&kind=${kind}` : ""}`),
    ...POLL,
  });
```

Declare `ClearV1Overview`, `ClearV1Gas`, `ClearV1Event` in the same file, field for field from the responses in Task 9. Numbers that can be null stay `number | null`.

- [ ] **Step 2: Panel**

`clear-v1-panel.tsx` renders, in order:

1. Heading "Clear V1", with a stale badge when `Date.now()/1000 - updatedAt > 1800`.
2. A daily chart of swap volume and revenue from `daily`, reusing Recharts as in `swap-volume-chart.tsx`, and four `KPICard`s: Gross TVL, Net TVL (sub: `IOU debt $X`), 7D Swap Volume, 7D Revenue. Null values render through `KPICard`'s `placeholder`. If `tvl.partial`, the sub text is "Oracle stale, partial data". Label figures "at par".
3. `<ReservesTable>`: label, gross, net, debt, share price (`netPar / supply`), 7D reserve-leg volume from `reserveVolume7d`, paused, rebalance needed. A null value shows "oracle stale".
4. `<PoolsTable>`: label, both balances with token symbols, 7D volume from `poolVolume7d`, pending admin fees. Below it, a small list of `entryPoints` (entry address, swaps, volume).
5. `<OracleFeeds>`: symbol, price, age from `lastUpdate` with `formatAge`, amber past `ttl`.
6. `<GasTable>`: label, balance, 7D spend, 7D txs, failures, runway and runway at p95 gas via `formatRunway`, or "Not enough data" when null.
7. `<ActivityFeed>`: kind filter (All, Swaps, Rebalances, Liquidity, Admin), rows linking to `https://etherscan.io/tx/<hash>`.

When `periods[2].swapCount === 0`, the volume section shows "No swaps yet".

- [ ] **Step 3: Mount it**

In `src/components/homepage-client.tsx`, import the panel and replace line 227:

```tsx
{clearMode && (
  <>
    <ClearV1Panel />
    <h2 className="text-lg font-semibold mt-8">v0.2 history</h2>
    <ClearProtocolPanel />
  </>
)}
```

- [ ] **Step 4: Build**

Run: `npm run lint && npm run build`
Expected: both pass.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/use-clear-v1.ts src/components/clear-protocol/v1 src/components/homepage-client.tsx
git commit -m "feat(clear-v1): V1 panel above v0.2 history"
```

---

### Task 11: End-to-end verification

No production changes in this task.

- [ ] **Step 1: Deploy-job check**

Run from a clean copy so root modules cannot hide a failure:

```bash
rm -rf /tmp/sh-ci && git clone -q . /tmp/sh-ci && cd /tmp/sh-ci && git checkout -q feat/clear-v1-indexer && cd worker && npm ci && npx tsc --noEmit
```

Expected: passes with only `worker/node_modules` installed. This reproduces `deploy-cloudflare.yml`.

- [ ] **Step 2: Local backfill**

Run the worker locally and trigger `*/5` repeatedly until the cursor reaches the tip (about 13 runs), then `*/15` once. `wrangler dev` needs `ROUTEMESH_RPC_URL` and `ETHERSCAN_API_KEY` locally: if they are not available, ask the user rather than reading secret files.

- [ ] **Step 3: Reconcile**

Compare local D1 counts with an independent scan through `rpc.mevblocker.io`:

```bash
npx wrangler d1 execute stablecoin-db --local --command "SELECT kind, COUNT(*) n FROM clear_v1_events GROUP BY kind"
```

Expected at deploy-plus-8-days: `deposit` 5, `iou_mint` 8, `pool_liquidity` 12, `pool_swap` at least 4, `swap` 0 unless new activity. Investigate any difference. Do not adjust numbers to match.

- [ ] **Step 4: Compare state with chain**

Check `/api/clear-v1-overview` against `cast call` for `totalAssets` and `totalIOUDebt` on Base, and `nativeValue` on one Meta. Expected: equal, and gross TVL about 7,909.

- [ ] **Step 5: Preview**

Start the frontend against the local worker, enable Clear mode, and confirm the V1 panel renders, including the zero-swap state, and the v0.2 panel is intact below. Screenshot it.

- [ ] **Step 6: Docs**

Update `CLAUDE.md`: Clear V1 tables, three crons, three endpoints. Commit.

```bash
git add CLAUDE.md
git commit -m "docs: Clear V1 indexer"
```

- [ ] **Step 7: Open the PR, do not merge**

Push the branch and open a PR. Merging deploys to production, so it needs the user's explicit go-ahead.
