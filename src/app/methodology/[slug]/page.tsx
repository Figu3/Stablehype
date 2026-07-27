import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatEventDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import type { MethodologyVersion } from "@shared/lib/methodology-version";
import { CSI_VERSION } from "@shared/lib/csi-version";
import { CSI_WEIGHTS } from "@shared/lib/csi-scoring";
import { PEG_SCORE_VERSION } from "@shared/lib/peg-score-version";
import { DEX_LIQUIDITY_VERSION } from "@shared/lib/dex-liquidity-version";
import { DEPEG_DETECTION_VERSION } from "@shared/lib/depeg-detection-version";
import { CLEAR_ORACLE_RISK_VERSION } from "@shared/lib/clear-oracle-risk-version";
import { REDEMPTION_BACKSTOP_VERSION } from "@shared/lib/redemption-backstop-version";
import { FLOWS_VERSION } from "@shared/lib/flows-version";
import {
  FLOW_PRESSURE_SCALE,
  FLOW_MIN_SUPPLY_USD,
  GAUGE_STRESS_THRESHOLD,
  GAUGE_STRENGTH_THRESHOLD,
} from "@shared/lib/flows-scoring";
import { MARKET_INDEX_VERSION } from "@shared/lib/market-index-version";
import {
  MARKET_INDEX_WEIGHTS,
  MARKET_INDEX_BANDS,
  STRESS_DEVIATION_BPS,
} from "@shared/lib/market-index-scoring";

/** A single row-data table rendered under a methodology description (weights, bands, parameters). */
interface MethodologyTable {
  title: string;
  columns: readonly string[];
  rows: readonly (readonly (string | number)[])[];
}

export interface MethodologyModuleEntry {
  slug: string;
  name: string;
  /** One-paragraph prose description of what the methodology measures. */
  description: string;
  version: MethodologyVersion;
  tables?: readonly MethodologyTable[];
}

function slugFromChangelogPath(changelogPath: string): string {
  return changelogPath.replace(/^\/methodology\//, "");
}

const CSI_COMPONENT_LABELS: { key: keyof typeof CSI_WEIGHTS; label: string }[] = [
  { key: "pegScore", label: "Peg stability" },
  { key: "dependencyRisk", label: "Dependency risk" },
  { key: "dexLiquidity", label: "DEX liquidity" },
  { key: "redemptionBackstop", label: "Redemption backstop" },
  { key: "bluechip", label: "Bluechip rating" },
];

const MARKET_INDEX_COMPONENT_LABELS: { key: keyof typeof MARKET_INDEX_WEIGHTS; label: string }[] = [
  { key: "deviation", label: "Peg deviation severity" },
  { key: "depegBreadth", label: "Active depeg breadth" },
  { key: "stressBreadth", label: `Pre-depeg stress breadth (≥${STRESS_DEVIATION_BPS} bps)` },
  { key: "mcapTrend", label: "7-day market-cap trend" },
];

/** Registry of every versioned methodology module surfaced on the transparency pages. */
export const METHODOLOGY_MODULES: readonly MethodologyModuleEntry[] = [
  {
    slug: slugFromChangelogPath(CSI_VERSION.changelogPath),
    name: "Clear Stability Index",
    description:
      "The Clear Stability Index (CSI) is a single composite 0–100 score for the six stablecoins used as Clear oracle inputs — USDT, USDC, GHO, USDe, USDS, and pyUSD. It blends five independently-scored signals: peg stability, upstream dependency risk, DEX liquidity, redemption backstop strength, and Bluechip's independent safety rating. When a component can't be computed for a coin (for example, no Bluechip coverage), its weight is redistributed proportionally across the remaining components; a composite score is only produced when at least 3 of the 5 components are available.",
    version: CSI_VERSION,
    tables: [
      {
        title: "Component weights",
        columns: ["Component", "Weight"],
        rows: CSI_COMPONENT_LABELS.map(({ key, label }) => [
          label,
          `${Math.round(CSI_WEIGHTS[key] * 100)}%`,
        ]),
      },
    ],
  },
  {
    slug: slugFromChangelogPath(PEG_SCORE_VERSION.changelogPath),
    name: "Peg Score",
    description:
      "The peg score measures how well a stablecoin has held its target peg across its full tracked history, expressed as a single 0–100 number. It combines the percentage of time spent within tolerance of peg, a severity penalty that weights each depeg event by the square of its peak deviation in basis points (so a handful of deep depegs hurt the score more than many shallow ones), and an additional penalty while a depeg is currently active. The stablecoin detail page hero, the peg-summary endpoint, and the peg leaderboard sort all read this same score.",
    version: PEG_SCORE_VERSION,
  },
  {
    slug: slugFromChangelogPath(DEX_LIQUIDITY_VERSION.changelogPath),
    name: "DEX Liquidity Score",
    description:
      "The DEX liquidity score is a 6-component composite (0–100) measuring how deep and durable a stablecoin's on-chain trading liquidity is, recomputed every 10 minutes from DeFiLlama Yields pool data cross-referenced against the Curve Finance API for pool-quality signals. Version 2.0 introduced quality-adjusted effective TVL — pool TVL is multiplied by a mechanism-quality factor (Curve StableSwap vs. CryptoSwap vs. generic AMM), a balance-health factor, and a co-token pair-quality factor before being summed — plus metapool TVL deduplication against each Curve base pool so shared liquidity isn't double-counted, and a durability score built from organic fee share, TVL/volume stability, and pool maturity.",
    version: DEX_LIQUIDITY_VERSION,
    tables: [
      {
        title: "Component weights",
        columns: ["Component", "Weight", "How computed"],
        rows: [
          ["TVL Depth", "30%", "Log-scale using quality-adjusted, metapool-deduped effective TVL"],
          ["Volume Activity", "20%", "Volume / TVL ratio"],
          ["Pool Quality", "20%", "Quality-adjusted TVL (mechanism × balance health × pair quality)"],
          ["Durability", "15%", "Organic fee fraction, TVL/volume stability, pool maturity"],
          ["Pair Diversity", "7.5%", "Pool count with diminishing returns"],
          ["Cross-chain", "7.5%", "Number of chains the stablecoin has liquidity on"],
        ],
      },
    ],
  },
  {
    slug: slugFromChangelogPath(DEPEG_DETECTION_VERSION.changelogPath),
    name: "Depeg Detection",
    description:
      "Depeg detection is the live pipeline that opens, tracks, and closes depeg events as price data streams in. A stablecoin enters a depeg event once its price deviation crosses the live threshold — currently 3 bps, tightened from 5 bps in v1.1 — with peak deviation, direction, and duration tracked until the price recovers within tolerance. To suppress false positives from a single noisy price source, opening a new event is cross-validated against DEX-implied prices from Curve pools: if a fresh DEX price still shows the coin at peg, the new event is suppressed.",
    version: DEPEG_DETECTION_VERSION,
  },
  {
    slug: slugFromChangelogPath(CLEAR_ORACLE_RISK_VERSION.changelogPath),
    name: "Clear Oracle Dependency Risk",
    description:
      "The Clear oracle dependency risk monitor scores upstream dependency risk — not peg or liquidity risk — for the same six Clear oracle stablecoins covered by the CSI. Each stablecoin's own governance model sets a self-backed baseline, which is then blended with weighted scores for every upstream dependency it relies on (collateral assets, custody arrangements, wrapper contracts, off-chain mechanisms), using hand-curated sentinel scores for non-tokenized dependencies like off-chain issuers, fiat banks, and CEX custody. A weak-dependency penalty and wrapper/mechanism ceilings, adapted from the project's legacy report-card model, keep a single strong self-score from masking a fragile upstream link. This methodology is pure configuration — it has no live data inputs.",
    version: CLEAR_ORACLE_RISK_VERSION,
  },
  {
    slug: slugFromChangelogPath(REDEMPTION_BACKSTOP_VERSION.changelogPath),
    name: "Redemption Backstops",
    description:
      "The redemption backstop score rates how reliably holders can actually redeem a stablecoin for its underlying value, independent of secondary-market liquidity. It classifies each coin's redemption route (PSM, withdrawal queue, issuer API, or collateral auction) and produces a 0–100 composite from six weighted components — access, settlement, execution certainty, capacity, output-asset quality, and cost — with route-family caps so, for example, a queue-based redemption route can't outscore a permissionless on-chain PSM regardless of its other components. This is a static-only scorer; live redemption capacity isn't yet modeled.",
    version: REDEMPTION_BACKSTOP_VERSION,
  },
  {
    slug: slugFromChangelogPath(FLOWS_VERSION.changelogPath),
    name: "Supply Flows",
    description:
      "Supply flows track net minting and burning for every tracked stablecoin over 24h, 7d, and 30d windows, derived entirely from DefiLlama circulating-supply snapshots already cached for the main dashboard — no new external data source. Each coin gets a pressure score comparing today's net flow against its own 30-day average daily flow, normalized by supply size, so a large stablecoin and a small one are judged on the same relative scale. A market-wide bank-run gauge (-100 to +100) is the market-cap-weighted mean of every coin's pressure score, giving a single number for aggregate issuance pressure across the tracked market.",
    version: FLOWS_VERSION,
    tables: [
      {
        title: "Scoring parameters",
        columns: ["Parameter", "Value", "Meaning"],
        rows: [
          ["Pressure scale", String(FLOW_PRESSURE_SCALE), "Multiplier converting excess daily flow (% of supply) into score points"],
          ["Minimum supply", `$${FLOW_MIN_SUPPLY_USD.toLocaleString("en-US")}`, "Coins below this supply are excluded from pressure scoring"],
          ["Redemption-stress threshold", String(GAUGE_STRESS_THRESHOLD), "Gauge below this value signals market-wide redemption stress"],
          ["Issuance-strength threshold", String(GAUGE_STRENGTH_THRESHOLD), "Gauge above this value signals market-wide issuance strength"],
        ],
      },
    ],
  },
  {
    slug: slugFromChangelogPath(MARKET_INDEX_VERSION.changelogPath),
    name: "Stablehype Market Index",
    description:
      "The Stablehype Market Index (SMI) is a single 0–100 health score for the entire tracked stablecoin market, computed from four signals already available in D1: supply-weighted mean absolute peg deviation, the share of tracked supply in an active depeg event, the share of tracked supply under pre-depeg stress (deviating 20+ bps without a formal event), and the 7-day trend in total tracked market cap. Breadth signals weight by supply rather than coin count so the permanently-wobbly long tail cannot pin the index while a majors depeg still moves it hard. The composite maps onto six sea-state bands from Glassy (calmest) to Meltdown (most stressed), and a daily snapshot is stored for historical charting.",
    version: MARKET_INDEX_VERSION,
    tables: [
      {
        title: "Component weights",
        columns: ["Component", "Weight"],
        rows: MARKET_INDEX_COMPONENT_LABELS.map(({ key, label }) => [
          label,
          `${Math.round(MARKET_INDEX_WEIGHTS[key] * 100)}%`,
        ]),
      },
      {
        title: "Sea-state bands",
        columns: ["Band", "Minimum score"],
        rows: MARKET_INDEX_BANDS.map((band) => [band.label, band.min]),
      },
    ],
  },
];

function findModule(slug: string): MethodologyModuleEntry | undefined {
  return METHODOLOGY_MODULES.find((mod) => mod.slug === slug);
}

export function generateStaticParams() {
  return METHODOLOGY_MODULES.map((mod) => ({ slug: mod.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const mod = findModule(slug);

  if (!mod) {
    return { title: "Methodology Not Found" };
  }

  const description = `${mod.description.slice(0, 155).trimEnd()}…`;

  return {
    title: `${mod.name} Methodology`,
    description,
    alternates: { canonical: `/methodology/${slug}/` },
    openGraph: {
      title: `${mod.name} Methodology | StableHype`,
      description,
      url: `/methodology/${slug}/`,
      type: "website",
      siteName: "StableHype",
      images: [{ url: "/og-card.png", width: 1200, height: 630 }],
    },
  };
}

function WeightTable({ table }: { table: MethodologyTable }) {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {table.title}
      </h3>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/30">
              {table.columns.map((col) => (
                <th
                  key={col}
                  className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-b last:border-0">
                {row.map((cell, cellIndex) => (
                  <td
                    key={cellIndex}
                    className={
                      cellIndex === 0
                        ? "px-3 py-2"
                        : "px-3 py-2 font-mono tabular-nums text-muted-foreground"
                    }
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default async function MethodologyDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const mod = findModule(slug);

  if (!mod) {
    notFound();
  }

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-1.5 text-sm text-muted-foreground"
        >
          <Link href="/" className="hover:text-foreground transition-colors">
            Dashboard
          </Link>
          <span>/</span>
          <Link
            href="/methodology/"
            className="hover:text-foreground transition-colors"
          >
            Methodology
          </Link>
          <span>/</span>
          <span className="text-foreground">{mod.name}</span>
        </nav>
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">{mod.name}</h1>
            <Badge
              variant="outline"
              className="border-frost-blue/30 bg-frost-blue/10 font-mono text-frost-blue"
            >
              {mod.version.versionLabel}
            </Badge>
          </div>
          <p className="max-w-3xl text-sm text-muted-foreground">
            {mod.description}
          </p>
        </div>
      </div>

      {mod.tables && mod.tables.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-2">
          {mod.tables.map((table) => (
            <WeightTable key={table.title} table={table} />
          ))}
        </div>
      )}

      <div className="space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Changelog
        </h2>
        <ol className="space-y-6 border-l pl-6">
          {mod.version.changelog.map((entry) => (
            <li key={`${entry.version}-${entry.effectiveAt}`} className="relative">
              <span className="absolute -left-[29px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-frost-blue" />
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm font-semibold">
                  v{entry.version}
                </span>
                <span className="text-sm font-medium">{entry.title}</span>
                <span className="text-xs text-muted-foreground">
                  {formatEventDate(entry.effectiveAt)}
                </span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{entry.summary}</p>
              {entry.impact.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {entry.impact.map((line) => (
                    <li key={line} className="flex gap-1.5">
                      <span aria-hidden>&bull;</span>
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              )}
              {entry.reconstructed && (
                <p className="mt-2 text-[10px] uppercase tracking-wider text-muted-foreground/70">
                  Reconstructed from git history
                </p>
              )}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
