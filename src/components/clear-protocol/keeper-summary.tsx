import { ExternalLink, Fuel } from "lucide-react";
import { ORACLE_KEEPER_ADDRESS } from "@/lib/clear-contracts";
import type { OracleGasMetrics } from "@/hooks/use-keeper-gas";
import { useKeeperGasFromD1, type CategoryMetrics } from "@/hooks/use-rebalance-gas";
import { formatUSD, formatRunway } from "./format";

function MiniStat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="rounded-lg border border-border/40 bg-muted/30 p-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="font-mono text-sm font-semibold mt-0.5">
        {value}
        {unit && <span className="text-[10px] text-muted-foreground ml-1">{unit}</span>}
      </div>
    </div>
  );
}

function CostCard({
  label,
  metrics,
  accent,
}: {
  label: string;
  metrics: CategoryMetrics;
  accent: "violet" | "amber";
}) {
  const dotColor = accent === "violet" ? "bg-violet-500" : "bg-amber-500";
  return (
    <div className="rounded-lg border border-border/40 bg-muted/30 p-3 space-y-2">
      <div className="flex items-center gap-1.5">
        <span className={`h-2 w-2 rounded-full ${dotColor}`} />
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          {label}
        </span>
        <span className="ml-auto text-[10px] text-muted-foreground">
          {metrics.totalTxs} txs
        </span>
      </div>
      <div className="font-mono text-lg font-semibold">
        {formatUSD(metrics.avgPerTx)}
        <span className="text-[10px] text-muted-foreground ml-1">avg/tx</span>
      </div>
      <div className="grid grid-cols-3 gap-1 text-[10px]">
        <div>
          <div className="text-muted-foreground">24h</div>
          <div className="font-mono font-medium">{formatUSD(metrics.daily)}</div>
        </div>
        <div>
          <div className="text-muted-foreground">7d avg/d</div>
          <div className="font-mono font-medium">{formatUSD(metrics.weekly)}</div>
        </div>
        <div>
          <div className="text-muted-foreground">30d avg/d</div>
          <div className="font-mono font-medium">{formatUSD(metrics.monthly)}</div>
        </div>
      </div>
    </div>
  );
}

export function KeeperSummary({ data }: { data: OracleGasMetrics }) {
  const d1Gas = useKeeperGasFromD1();

  // Combined daily ETH burn, preferring the most stable window we have data for.
  // ETH-denominated so moves in ETH/USD don't skew the runway number. Defaults
  // guard against older worker deploys that don't yet return *ETH fields.
  const oracleM = d1Gas.data?.oracle;
  const rebM = d1Gas.data?.rebalance;
  const dailyBurnETH =
    ((oracleM?.monthlyETH ?? 0) + (rebM?.monthlyETH ?? 0)) ||
    ((oracleM?.weeklyETH ?? 0) + (rebM?.weeklyETH ?? 0)) ||
    ((oracleM?.dailyETH ?? 0) + (rebM?.dailyETH ?? 0)) ||
    0;

  const combinedDailyBurnUSD = dailyBurnETH * data.ethPrice;

  const runwayDays = dailyBurnETH > 0
    ? data.ethBalance / dailyBurnETH
    : data.expectedRunwayDays; // fall back to the dashboard's 7d estimate

  const runwayColor =
    runwayDays > 30
      ? "border-emerald-500/30 bg-emerald-500/5"
      : runwayDays > 7
        ? "border-amber-500/30 bg-amber-500/5"
        : "border-red-500/30 bg-red-500/5";

  const runwayTextColor =
    runwayDays > 30
      ? "text-emerald-600 dark:text-emerald-400"
      : runwayDays > 7
        ? "text-amber-600 dark:text-amber-400"
        : "text-red-600 dark:text-red-400";

  const runwayIconColor =
    runwayDays > 30
      ? "text-emerald-500"
      : runwayDays > 7
        ? "text-amber-500"
        : "text-red-500";

  const emptyMetrics: CategoryMetrics = {
    totalETH: 0, totalUSD: 0, totalTxs: 0, avgPerTx: 0,
    daily: 0, weekly: 0, monthly: 0,
    dailyETH: 0, weeklyETH: 0, monthlyETH: 0,
    txsLast7d: 0, txsLast30d: 0,
    txPerHour7d: 0, avgCostETH7d: 0, p95CostETH30d: 0, maxCostETH30d: 0,
  };

  return (
    <div className="rounded-xl border border-border/60 bg-card p-4 space-y-4">
      {/* Runway */}
      <div className={`rounded-lg border ${runwayColor} p-3`}>
        <div className="flex items-center gap-2">
          <Fuel className={`h-5 w-5 ${runwayIconColor}`} />
          <div>
            <div className="text-xs text-muted-foreground">Gas Runway</div>
            <div className={`text-xl font-bold font-mono ${runwayTextColor}`}>
              {formatRunway(runwayDays)}
            </div>
          </div>
          {combinedDailyBurnUSD > 0 && (
            <div className="ml-auto text-right">
              <div className="text-[10px] text-muted-foreground">burn rate</div>
              <div className="text-xs font-mono text-muted-foreground">
                {formatUSD(combinedDailyBurnUSD)}/day
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Balance */}
      <div className="grid grid-cols-2 gap-2">
        <MiniStat label="ETH Balance" value={data.ethBalance.toFixed(4)} unit="ETH" />
        <MiniStat label="USD Value" value={formatUSD(data.ethBalanceUSD)} />
      </div>

      {/* Oracle vs Rebalance split */}
      <div className="grid grid-cols-2 gap-2">
        <CostCard
          label="Oracle"
          metrics={d1Gas.data?.oracle ?? emptyMetrics}
          accent="violet"
        />
        <CostCard
          label="Rebalance"
          metrics={d1Gas.data?.rebalance ?? emptyMetrics}
          accent="amber"
        />
      </div>

      {/* Keeper address */}
      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
        <code className="bg-muted px-1.5 py-0.5 rounded font-mono">
          {ORACLE_KEEPER_ADDRESS.slice(0, 6)}&hellip;{ORACLE_KEEPER_ADDRESS.slice(-4)}
        </code>
        <a
          href={`https://etherscan.io/address/${ORACLE_KEEPER_ADDRESS}`}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-foreground"
        >
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}
