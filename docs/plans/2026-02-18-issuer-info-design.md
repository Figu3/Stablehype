# Issuer Info (Links + Jurisdiction) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add official links and jurisdiction metadata for all tracked stablecoins, displayed in a dedicated "Issuer Info" card on the detail page.

**Architecture:** Static metadata in `StablecoinOpts` — same pattern as `collateral`, `pegMechanism`, and `proofOfReserves`. New `StablecoinLink[]` and `Jurisdiction` interfaces. New `IssuerInfoCard` component rendered after MechanismCard on the detail page.

**Tech Stack:** TypeScript types, React component (lucide-react icons), Tailwind CSS.

---

### Task 1: Add StablecoinLink and Jurisdiction types

**Files:**
- Modify: `src/lib/types.ts` (after ProofOfReserves interface, before StablecoinMeta)

**Step 1: Add new interfaces**

Insert after the `ProofOfReserves` interface (line 27), before `StablecoinMeta`:

```ts
export interface StablecoinLink {
  label: string;
  url: string;
}

export interface Jurisdiction {
  country: string;
  regulator?: string;
  license?: string;
}
```

**Step 2: Add fields to StablecoinMeta**

Add after the `proofOfReserves` field:

```ts
links?: StablecoinLink[];
jurisdiction?: Jurisdiction;
```

**Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

---

### Task 2: Thread links and jurisdiction through StablecoinOpts and helpers

**Files:**
- Modify: `src/lib/stablecoins.ts:5-23` (StablecoinOpts and usd/eur/other helpers)

**Step 1: Add fields to StablecoinOpts**

```ts
links?: import("./types").StablecoinLink[];
jurisdiction?: import("./types").Jurisdiction;
```

**Step 2: Thread through all three helpers**

Each helper must pass `links: opts?.links, jurisdiction: opts?.jurisdiction` in the returned object. Add alongside the existing `proofOfReserves: opts?.proofOfReserves`.

**Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

---

### Task 3: Research and populate links for ALL tracked stablecoins

**Files:**
- Modify: `src/lib/stablecoins.ts` (add `links` to each coin's opts)

Research official website and Twitter/X for every stablecoin in `TRACKED_STABLECOINS`. Add `links` array to each coin's opts object.

**Format:**
```ts
links: [
  { label: "Website", url: "https://tether.to" },
  { label: "Twitter", url: "https://x.com/Tether_to" },
],
```

Add docs/GitHub links only where they are prominent and useful (e.g. protocol docs for DeFi stablecoins).

**All ~120 coins need at minimum a Website link. Twitter where available.**

**Step: Type-check after all entries**

Run: `npx tsc --noEmit`
Expected: No errors.

---

### Task 4: Research and populate jurisdiction for centralized + CeFi-dependent stablecoins

**Files:**
- Modify: `src/lib/stablecoins.ts` (add `jurisdiction` to ~89 coins' opts)

Research the legal jurisdiction, regulator, and license type for each centralized and CeFi-dependent stablecoin.

**Format:**
```ts
jurisdiction: { country: "United States", regulator: "NYDFS", license: "Trust Charter" },
```

**Key known jurisdictions:**

| Coin | Country | Regulator | License |
|------|---------|-----------|---------|
| USDT | El Salvador | CNAD | Digital Asset Service Provider |
| USDC | United States | NYDFS + State MTLs | Money Transmitter |
| PYUSD | United States | NYDFS | Trust Charter (Paxos) |
| USDP | United States | NYDFS | Trust Charter |
| GUSD (Gemini) | United States | NYDFS | Trust Charter |
| PAXG | United States | NYDFS | Trust Charter |
| EURC | France | ACPR | MiCA EMI |
| FDUSD | Hong Kong | — | Trust Company |
| RLUSD | United States | NYDFS | Trust Charter |
| DAI/USDS | Cayman Islands | — | — |
| USDe | BVI | — | — |

All other coins: research needed.

**Do NOT add jurisdiction to decentralized coins (LUSD, BOLD, ZCHF, BEAN).**

**Step: Type-check after all entries**

Run: `npx tsc --noEmit`
Expected: No errors.

---

### Task 5: Create IssuerInfoCard component and add to detail page

**Files:**
- Modify: `src/app/stablecoin/[id]/client.tsx`

**Step 1: Add lucide-react icon imports**

Add `Globe, Twitter, FileText, Link as LinkIcon` to the existing lucide-react import (or use `Globe` for website, a simple SVG for X/Twitter since lucide doesn't have a Twitter icon — use `ExternalLink` as fallback for generic links).

Actually, lucide-react has `Globe` and `ExternalLink` already imported. Add `Globe` to the import. For Twitter/X, use the label text since lucide doesn't have a brand icon.

**Step 2: Create IssuerInfoCard function**

Add a new function component in `client.tsx` (after `MechanismCard`):

```tsx
function IssuerInfoCard({ meta }: { meta: StablecoinMeta }) {
  const isDecentralized = meta.flags.governance === "decentralized";
  const hasLinks = meta.links && meta.links.length > 0;
  const hasJurisdiction = !isDecentralized && meta.jurisdiction;

  if (!hasLinks && !hasJurisdiction) return null;

  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-2">
        <CardTitle>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Issuer Info
          </h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasJurisdiction && meta.jurisdiction && (
          <div className="rounded-xl bg-muted/50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Jurisdiction</p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{meta.jurisdiction.country}</span>
              {meta.jurisdiction.regulator && (
                <span className="inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold bg-blue-500/10 text-blue-500 border-blue-500/20">
                  {meta.jurisdiction.regulator}
                </span>
              )}
              {meta.jurisdiction.license && (
                <span className="inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold bg-violet-500/10 text-violet-500 border-violet-500/20">
                  {meta.jurisdiction.license}
                </span>
              )}
            </div>
          </div>
        )}

        {hasLinks && (
          <div className="flex flex-wrap gap-3">
            {meta.links!.map((link) => (
              <a
                key={link.url}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors"
              >
                {link.label === "Website" ? (
                  <Globe className="h-3.5 w-3.5" />
                ) : (
                  <ExternalLink className="h-3.5 w-3.5" />
                )}
                {link.label}
              </a>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

**Step 3: Add Globe to lucide-react import**

Line 4: `import { ArrowLeft, ExternalLink, Globe } from "lucide-react";`

**Step 4: Render IssuerInfoCard in the page**

After the MechanismCard render (around line 341), add:

```tsx
{meta && (
  <IssuerInfoCard meta={meta} />
)}
```

So the order becomes: MechanismCard → IssuerInfoCard → DepegHistory → ChainDistribution.

**Step 5: Type-check and build**

Run: `npx tsc --noEmit`
Run: `npm run build`
Expected: Clean build.
