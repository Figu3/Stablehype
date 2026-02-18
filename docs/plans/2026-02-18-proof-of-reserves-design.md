# Proof of Reserves Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add proof-of-reserves (PoR) metadata to centralized and CeFi-dependent stablecoins and display it on the detail page's Mechanism Card.

**Architecture:** Static metadata approach — PoR data lives in `StablecoinOpts` alongside existing `collateral` and `pegMechanism` fields. Three PoR types: `independent-audit`, `real-time`, `self-reported`. Display as badge + detail section in the existing Mechanism Card. "No PoR" indicator for coins that lack it.

**Tech Stack:** TypeScript types, React component updates (client.tsx MechanismCard), lucide-react icons, Tailwind CSS.

---

### Task 1: Add ProofOfReserves types to types.ts

**Files:**
- Modify: `src/lib/types.ts:28-29` (after `goldOunces` field in StablecoinMeta)

**Step 1: Add the new type and interface**

Add after the `StablecoinFlags` interface (before `StablecoinMeta`), around line 19:

```ts
export type ProofOfReservesType = "independent-audit" | "real-time" | "self-reported";

export interface ProofOfReserves {
  type: ProofOfReservesType;
  url: string;
  provider?: string;
}
```

**Step 2: Add field to StablecoinMeta**

Add `proofOfReserves?: ProofOfReserves;` after the `goldOunces` field on line 28:

```ts
export interface StablecoinMeta {
  id: string;
  name: string;
  symbol: string;
  flags: StablecoinFlags;
  collateral?: string;
  pegMechanism?: string;
  goldOunces?: number;
  proofOfReserves?: ProofOfReserves;
}
```

**Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors (field is optional, nothing references it yet).

---

### Task 2: Thread proofOfReserves through StablecoinOpts and helper functions

**Files:**
- Modify: `src/lib/stablecoins.ts:5-22` (StablecoinOpts interface and usd/eur/other helpers)

**Step 1: Add field to StablecoinOpts**

```ts
interface StablecoinOpts {
  yieldBearing?: boolean;
  rwa?: boolean;
  navToken?: boolean;
  collateral?: string;
  pegMechanism?: string;
  goldOunces?: number;
  proofOfReserves?: import("./types").ProofOfReserves;
}
```

**Step 2: Thread through usd(), eur(), other() helpers**

Each helper must pass `proofOfReserves: opts?.proofOfReserves` in the returned object. For example `usd()`:

```ts
function usd(id, name, symbol, backing, governance, opts?) {
  return { id, name, symbol, flags: { ... }, collateral: opts?.collateral, pegMechanism: opts?.pegMechanism, proofOfReserves: opts?.proofOfReserves };
}
```

Same for `eur()` and `other()`.

**Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

---

### Task 3: Research and populate PoR data for all centralized + CeFi-dependent stablecoins

**Files:**
- Modify: `src/lib/stablecoins.ts` (add `proofOfReserves` to individual coin entries)

This is the data-entry task. For each of the ~89 centralized and CeFi-dependent stablecoins, research whether they publish proof of reserves and add the appropriate data.

**Research approach:**
1. Check the issuer's official website for transparency/audit pages
2. Check if Chainlink Proof of Reserve covers the asset
3. Check for third-party attestation reports (Deloitte, BDO, Grant Thornton, Armanino, etc.)
4. If no PoR found, leave the field absent (the UI will show "No PoR")

**Known PoR entries to add (verify URLs during implementation):**

| Coin | Type | Provider | URL |
|------|------|----------|-----|
| USDT | independent-audit | BDO Italia | https://tether.to/en/transparency/ |
| USDC | independent-audit | Deloitte | https://www.circle.com/transparency |
| USDe | real-time | Accountable | https://accountable.neutrl.fi/ |
| PYUSD | independent-audit | — | PayPal transparency page |
| DAI | self-reported | — | https://makerburn.com/ |
| USDS | self-reported | — | https://info.sky.money/ |
| TUSD | real-time | Chainlink / Armanino | https://real-time.armanino.com/tusd |
| FDUSD | independent-audit | — | First Digital attestation |
| EURC | independent-audit | Deloitte | Circle transparency |
| RLUSD | independent-audit | — | Ripple attestation |
| XAUT | real-time | TDR | https://gold.tether.to/ |
| PAXG | independent-audit | — | Paxos attestation |
| USDP | independent-audit | — | Paxos attestation |
| GUSD (Gemini) | independent-audit | BPM | Gemini attestation |
| BUIDL | self-reported | — | Securitize dashboard |
| M (M0) | real-time | — | M0 on-chain verification |

All other coins: research needed. Many smaller issuers likely have no PoR.

**Step: Type-check after all entries**

Run: `npx tsc --noEmit`
Expected: No errors.

---

### Task 4: Update MechanismCard to display PoR badge and detail section

**Files:**
- Modify: `src/app/stablecoin/[id]/client.tsx:98-137` (MechanismCard component)

**Step 1: Add PoR badge style map**

Add above or inside MechanismCard:

```ts
const POR_STYLE: Record<string, { label: string; cls: string }> = {
  "independent-audit": { label: "Independent Audit", cls: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
  "real-time": { label: "Real-Time PoR", cls: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" },
  "self-reported": { label: "Self-Reported PoR", cls: "bg-amber-500/10 text-amber-500 border-amber-500/20" },
};
```

**Step 2: Add PoR badge to the badge row**

After the existing RWA badge (line 115), add:

```tsx
{/* PoR badge — only for centralized / CeFi-dependent */}
{meta.flags.governance !== "decentralized" && (
  meta.proofOfReserves ? (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${POR_STYLE[meta.proofOfReserves.type].cls}`}>
      {POR_STYLE[meta.proofOfReserves.type].label}
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold bg-red-500/10 text-red-500 border-red-500/20">
      No PoR
    </span>
  )
)}
```

**Step 3: Add PoR detail section below collateral/pegMechanism**

After the existing `hasDescription` grid (line 133), add a PoR section for centralized/CeFi-dep coins:

```tsx
{meta.flags.governance !== "decentralized" && (
  <div className="rounded-xl bg-muted/50 p-4">
    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Proof of Reserves</p>
    {meta.proofOfReserves ? (
      <div className="space-y-1">
        <p className="text-sm leading-relaxed">
          {POR_STYLE[meta.proofOfReserves.type].label}
          {meta.proofOfReserves.provider && ` by ${meta.proofOfReserves.provider}`}
        </p>
        <a
          href={meta.proofOfReserves.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm text-blue-500 hover:underline"
        >
          View reserves <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    ) : (
      <p className="text-sm text-muted-foreground">No proof of reserves published</p>
    )}
  </div>
)}
```

**Step 4: Add ExternalLink import**

Add `ExternalLink` to the lucide-react import on line 4:

```ts
import { ArrowLeft, ExternalLink } from "lucide-react";
```

**Step 5: Type-check and build**

Run: `npx tsc --noEmit`
Expected: No errors.

Run: `npm run build`
Expected: Clean build.

---

### Task 5: Visual verification and cleanup

**Step 1: Start dev server and verify**

Run: `NEXT_PUBLIC_API_BASE=<worker-url> npm run dev`

Check these detail pages:
- `/stablecoin/2` (USDC) — should show "Independent Audit" badge + blue detail box with Deloitte + Circle link
- `/stablecoin/146` (USDe) — should show "Real-Time PoR" badge + green detail box with Accountable link
- `/stablecoin/5` (DAI) — should show "Self-Reported PoR" badge + amber detail box with MakerBurn link
- `/stablecoin/269` (BOLD) — decentralized, should show NO PoR badge or section at all
- A smaller centralized coin without PoR — should show "No PoR" red badge + muted "No proof of reserves published"

**Step 2: Final build**

Run: `npm run build`
Expected: Clean static export.
