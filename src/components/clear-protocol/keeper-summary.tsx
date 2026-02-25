import { ExternalLink, Fuel } from "lucide-react";
import { ORACLE_KEEPER_ADDRESS } from "@/lib/clear-contracts";
import type { OracleGasMetrics } from "@/hooks/use-keeper-gas";
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

export function KeeperSummary({ data }: { data: OracleGasMetrics }) {
  const runwayColor =
    data.expectedRunwayDays > 30
      ? "border-emerald-500/30 bg-emerald-500/5"
      : data.expectedRunwayDays > 7
        ? "border-amber-500/30 bg-amber-500/5"
        : "border-red-500/30 bg-red-500/5";

  const runwayTextColor =
    data.expectedRunwayDays > 30
      ? "text-emerald-600 dark:text-emerald-400"
      : data.expectedRunwayDays > 7
        ? "text-amber-600 dark:text-amber-400"
        : "text-red-600 dark:text-red-400";

  const runwayIconColor =
    data.expectedRunwayDays > 30
      ? "text-emerald-500"
      : data.expectedRunwayDays > 7
        ? "text-amber-500"
        : "text-red-500";

  // Get last 7 days of gas data for chart
  const last7Days = data.statistics.dailyData.slice(-7);
  const maxCost = Math.max(...last7Days.map((d) => d.totalGasCost), 0.01);

  return (
    <div className="rounded-xl border border-border/60 bg-card p-4 space-y-4">
      {/* Runway */}
      <div className={`rounded-lg border ${runwayColor} p-3`}>
        <div className="flex items-center gap-2">
          <Fuel className={`h-5 w-5 ${runwayIconColor}`} />
          <div>
            <div className="text-xs text-muted-foreground">Gas Runway</div>
            <div className={`text-xl font-bold font-mono ${runwayTextColor}`}>
              {formatRunway(data.expectedRunwayDays)}
            </div>
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-2">
        <MiniStat label="ETH Balance" value={data.ethBalance.toFixed(4)} unit="ETH" />
        <MiniStat label="USD Value" value={formatUSD(data.ethBalanceUSD)} />
        <MiniStat label="Avg Cost/TX" value={formatUSD(data.statistics.allTimeAverage)} />
        <MiniStat label="Total TXs" value={String(data.statistics.totalTransactions)} />
      </div>

      {/* 7d gas trend */}
      {last7Days.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[10px] text-muted-foreground">7d Gas Cost (USD)</div>
          <div className="flex items-end gap-1 h-10">
            {last7Days.map((d, i) => (
              <div
                key={i}
                className="flex-1 bg-violet-500/40 rounded-t-sm transition-all"
                style={{ height: `${(d.totalGasCost / maxCost) * 100}%` }}
                title={`${d.date}: ${formatUSD(d.totalGasCost)}`}
              />
            ))}
          </div>
          <div className="flex justify-between text-[9px] text-muted-foreground">
            <span>{last7Days[0]?.date.slice(5) ?? ""}</span>
            <span>{last7Days[last7Days.length - 1]?.date.slice(5) ?? ""}</span>
          </div>
        </div>
      )}

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
