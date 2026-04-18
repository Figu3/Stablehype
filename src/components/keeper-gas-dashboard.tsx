"use client";

import Link from "next/link";
import {
  ArrowLeft,
  RefreshCw,
  Fuel,
  AlertTriangle,
  ExternalLink,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { useKeeperGas, type OracleGasMetrics } from "@/hooks/use-keeper-gas";
import { ORACLE_KEEPER_ADDRESS } from "@/lib/clear-contracts";

// ── Helpers ──────────────────────────────────────────────────────────────────

function runwayColor(days: number): string {
  if (days > 30) return "border-emerald-500 bg-emerald-500/5";
  if (days > 7) return "border-amber-500 bg-amber-500/5";
  return "border-red-500 bg-red-500/5";
}

function runwayTextColor(days: number): string {
  if (days > 30) return "text-emerald-600 dark:text-emerald-400";
  if (days > 7) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function deviationBadge(pct: number): string {
  if (pct > 10) return `text-red-500`;
  if (pct < -10) return `text-emerald-500`;
  return "text-muted-foreground";
}

function formatRunway(days: number, hours: number): string {
  if (days >= 1) return `${Math.floor(days)}d ${Math.floor((days % 1) * 24)}h`;
  return `${hours.toFixed(1)} hours`;
}

// ── Main component ───────────────────────────────────────────────────────────

export function KeeperGasDashboard() {
  const { data, isLoading, isFetching, error, refetch } = useKeeperGas();

  if (error) {
    return (
      <div className="space-y-4">
        <BackLink />
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
          <AlertTriangle className="mx-auto h-5 w-5 text-destructive mb-2" />
          <p className="text-sm text-destructive">Failed to fetch keeper gas data.</p>
          <button
            onClick={() => refetch()}
            className="mt-2 text-xs text-muted-foreground underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <BackLink />
        <KeeperGasSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <BackLink />
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`} />
          {isFetching ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <RunwayBanner data={data} />
      <GasStatsGrid data={data} />
      <DailyGasChart data={data} />
      <KeeperInfo data={data} />
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function BackLink() {
  return (
    <Link
      href="/routes"
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
    >
      <ArrowLeft className="h-3 w-3" />
      Back to Routes
    </Link>
  );
}

function RunwayBanner({ data }: { data: OracleGasMetrics }) {
  const expectedDays = data.expectedRunwayDays;
  const worstDays = data.worstCaseRunwayDays;
  const hasData = data.baseline.txsInWindow > 0;

  const expectedLabel = hasData
    ? formatRunway(expectedDays, data.expectedRunwayHours)
    : "n/a";
  const worstLabel = hasData
    ? formatRunway(worstDays, data.worstCaseRunwayHours)
    : "n/a";

  return (
    <div className={`rounded-lg border-l-4 border ${runwayColor(expectedDays)} p-4`}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Fuel className={`h-6 w-6 ${runwayTextColor(expectedDays)}`} />
          <div>
            <div className="text-xs font-medium text-muted-foreground">Oracle Gas Runway</div>
            <div className={`text-2xl font-bold font-mono ${runwayTextColor(expectedDays)}`}>
              {expectedLabel}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Worst-case (p95 gas, 30d): <span className="font-mono">{worstLabel}</span>
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              {hasData
                ? `Baseline: ${data.baseline.txPerHour.toFixed(2)} tx/h × Ξ${data.baseline.avgCostETH.toFixed(6)} avg (7d, n=${data.baseline.txsInWindow})`
                : "No recent keeper txs observed — runway unavailable."}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted-foreground">ETH Balance</div>
          <div className="font-mono text-lg font-semibold">{data.ethBalance.toFixed(4)} ETH</div>
          <div className="text-xs text-muted-foreground">${data.ethBalanceUSD.toFixed(2)}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            Floor: Ξ{data.minOperationalBalanceETH.toFixed(6)}/tx
          </div>
        </div>
      </div>
    </div>
  );
}

function GasStatsGrid({ data }: { data: OracleGasMetrics }) {
  const stats = data.statistics;

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-medium text-muted-foreground">Gas Cost Statistics</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {/* Last Day — highlighted */}
        <div className="rounded-lg border-2 border-foreground/20 bg-card p-3">
          <div className="text-xs text-muted-foreground">Last Day Avg / Tx</div>
          <div className="font-mono text-lg font-semibold mt-0.5">
            {stats.dayAverage > 0 ? `$${stats.dayAverage.toFixed(4)}` : "N/A"}
          </div>
          <div className="text-[10px] text-muted-foreground mt-1">
            USD priced at ingest time
          </div>
        </div>

        <StatCard
          label="Week Average"
          value={`$${stats.weekAverage.toFixed(4)}`}
          deviation={stats.weekDeviation}
        />

        <StatCard
          label="Month Average"
          value={`$${stats.monthAverage.toFixed(4)}`}
          deviation={stats.monthDeviation}
        />

        {/* Baseline in ETH */}
        <div className="rounded-lg border border-border/60 bg-card p-3">
          <div className="text-xs text-muted-foreground">7d Baseline (ETH)</div>
          <div className="font-mono text-lg font-semibold mt-0.5">
            Ξ{data.baseline.avgCostETH.toFixed(6)}
          </div>
          <div className="text-[10px] text-muted-foreground mt-1">
            {data.baseline.txsInWindow} txs · {data.baseline.txPerHour.toFixed(2)}/hr
          </div>
        </div>

        <div className="rounded-lg border border-border/60 bg-card p-3">
          <div className="text-xs text-muted-foreground">All-Time Average</div>
          <div className="font-mono text-lg font-semibold mt-0.5">
            ${stats.allTimeAverage.toFixed(4)}
          </div>
          <div className="text-[10px] text-muted-foreground mt-1">
            {stats.totalTransactions} total transactions
          </div>
        </div>

        <div className="rounded-lg border border-border/60 bg-card p-3">
          <div className="text-xs text-muted-foreground">ETH Price</div>
          <div className="font-mono text-lg font-semibold mt-0.5">
            ${data.ethPrice.toFixed(2)}
          </div>
          <div className="text-[10px] text-muted-foreground mt-1">From Chainlink</div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  deviation,
}: {
  label: string;
  value: string;
  deviation: number;
}) {
  const sign = deviation >= 0 ? "+" : "";
  return (
    <div className="rounded-lg border border-border/60 bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-mono text-lg font-semibold mt-0.5">{value}</div>
      <div className={`text-[10px] mt-1 ${deviationBadge(deviation)}`}>
        {sign}{deviation.toFixed(1)}% vs all-time
      </div>
    </div>
  );
}

function DailyGasChart({ data }: { data: OracleGasMetrics }) {
  const chartData = data.statistics.dailyData;

  if (chartData.length === 0) {
    return (
      <div className="rounded-lg border border-border/60 bg-card p-6 text-center">
        <p className="text-sm text-muted-foreground">
          No gas data available yet. Data will populate as oracle transactions are recorded.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-medium text-muted-foreground">Daily Gas Costs</h2>
      <div className="rounded-lg border border-border/60 bg-card p-4">
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              dataKey="date"
              stroke="hsl(var(--muted-foreground))"
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
              tickFormatter={(d: string) =>
                new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" })
              }
            />
            <YAxis
              stroke="hsl(var(--muted-foreground))"
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
              tickFormatter={(v: number) => `$${v.toFixed(2)}`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "0.5rem",
                fontSize: 12,
              }}
              labelStyle={{ color: "hsl(var(--foreground))" }}
              formatter={(value: number | undefined, name: string | undefined) => [
                value != null ? `$${value.toFixed(4)}` : "—",
                name === "totalGasCost" ? "Total Cost" : "Avg per TX",
              ]}
              labelFormatter={(d) => new Date(String(d)).toLocaleDateString()}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line
              type="monotone"
              dataKey="totalGasCost"
              stroke="#8b5cf6"
              name="Total Daily Cost"
              strokeWidth={2}
              dot={{ fill: "#8b5cf6", r: 3 }}
              activeDot={{ r: 5 }}
            />
            <Line
              type="monotone"
              dataKey="avgGasCost"
              stroke="#10b981"
              name="Avg per TX"
              strokeWidth={2}
              dot={{ fill: "#10b981", r: 3 }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function KeeperInfo({ data }: { data: OracleGasMetrics }) {
  return (
    <div className="rounded-lg border border-border/60 bg-card p-4 space-y-2">
      <h3 className="text-xs font-medium text-muted-foreground">Oracle Keeper</h3>
      <div className="flex items-center gap-2">
        <code className="text-xs font-mono bg-muted px-2 py-1 rounded">
          {ORACLE_KEEPER_ADDRESS}
        </code>
        <a
          href={`https://etherscan.io/address/${ORACLE_KEEPER_ADDRESS}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-foreground transition-colors"
          title="View on Etherscan"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
      <p className="text-[10px] text-muted-foreground">
        This address submits oracle price updates. Runway derived from observed 7d
        cadence and per-tx ETH cost (server-side aggregation).
        {data.statistics.totalTransactions > 0 && (
          <> Total tracked: {data.statistics.totalTransactions} transactions.</>
        )}
      </p>
    </div>
  );
}

// ── Skeleton ─────────────────────────────────────────────────────────────────

export function KeeperGasSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-24 bg-muted rounded-lg" />
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-20 bg-muted rounded-lg" />
        ))}
      </div>
      <div className="h-72 bg-muted rounded-lg" />
      <div className="h-16 bg-muted rounded-lg" />
    </div>
  );
}
