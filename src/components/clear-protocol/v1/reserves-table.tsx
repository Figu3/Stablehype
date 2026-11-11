import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ClearV1Overview } from "@/hooks/use-clear-v1";
import { money, STALE, usd } from "./helpers";

type Reserve = NonNullable<ClearV1Overview["state"]>["reserves"][number];

const STATUS = {
  paused: { label: "Paused", dot: "bg-rose-500", text: "text-rose-500 font-medium" },
  stale: { label: STALE, dot: "bg-muted-foreground/50", text: "text-muted-foreground" },
  rebalance: { label: "Needs rebalance", dot: "bg-amber-500", text: "text-amber-500 font-medium" },
  live: { label: "Live", dot: "bg-emerald-500", text: "" },
} as const;

const statusOf = (r: Reserve): keyof typeof STATUS =>
  r.paused ? "paused" : r.paused === null || r.netPar === null ? "stale" : r.rebalanceNeeded ? "rebalance" : "live";

/** A known zero reads as a quiet dash, so the rows that carry a figure stand out. Unknown stays "oracle stale". */
const quiet = (v: number | null | undefined) =>
  v === 0 ? <span className="text-muted-foreground/60">-</span> : usd(v);

type LpApr = NonNullable<ClearV1Overview["reserveLpApr7d"]>[number];

const pct = (v: number) => `${v.toFixed(2)}%`;

const aprTitle = (a: LpApr) => [
  a.navApr != null && a.navStart != null && a.navEnd != null
    ? `Share price ${a.navStart.toFixed(5)} to ${a.navEnd.toFixed(5)} over ${a.navDays} days: ${pct(a.navApr)} a year`
    : "Share price APR: not enough history",
  a.apr != null ? `Swap and flash-loan fees: ${pct(a.apr)} (${money(a.lpFees)} over ${a.days} ${a.days === 1 ? "day" : "days"})` : null,
  a.otherApr != null ? `Deposits, withdrawals and rebalances: ${pct(a.otherApr)}` : null,
].filter(Boolean).join("\n");

export function ReservesTable({ overview }: { overview: ClearV1Overview }) {
  const reserves = overview.state?.reserves ?? [];
  const volume = new Map(overview.reserveVolume7d.map((v) => [v.address, v.volume]));
  const lpApr = new Map((overview.reserveLpApr7d ?? []).map((v) => [v.address, v]));
  // Shares only mean something when every reserve is priced.
  const total = reserves.some((r) => r.netPar === null) ? null : reserves.reduce((a, r) => a + (r.netPar as number), 0);

  return (
    <div>
      <h2 className="text-base font-semibold mb-2">Reserves</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Reserve</TableHead>
            <TableHead className="text-right">Net</TableHead>
            <TableHead className="hidden sm:table-cell w-40">Share of TVL</TableHead>
            <TableHead className="text-right">IOU debt</TableHead>
            <TableHead className="text-right">Share price</TableHead>
            <TableHead className="text-right">7D volume</TableHead>
            <TableHead className="text-right" title="What an LP earned over the last 7 days: share price growth, annualised (Base at the bLP redemption price). Below it, the part that came from swap and flash-loan fees. The rest is deposit and withdrawal pricing and rebalances, which can be one-off.">
              7D LP APR
            </TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {reserves.map((r) => {
            const price = r.netPar !== null && r.supply !== null && r.supply > 0 ? r.netPar / r.supply : null;
            const share = total && r.netPar !== null ? (r.netPar / total) * 100 : null;
            const s = STATUS[statusOf(r)];
            const apr = lpApr.get(r.address);
            return (
              <TableRow key={r.address}>
                <TableCell className="font-medium">{r.label}</TableCell>
                <TableCell className="text-right tabular-nums font-medium">{usd(r.netPar)}</TableCell>
                <TableCell className="hidden sm:table-cell">
                  {share === null ? <span className="text-muted-foreground/60">-</span> : (
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 rounded-full bg-muted">
                        <div className="h-1.5 rounded-full bg-violet-500" style={{ width: `${Math.max(share, 1)}%` }} />
                      </div>
                      <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">{share.toFixed(0)}%</span>
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">{quiet(r.iouDebtPar)}</TableCell>
                <TableCell className="text-right tabular-nums">{price === null ? STALE : price.toFixed(4)}</TableCell>
                <TableCell className="text-right tabular-nums">{quiet(volume.get(r.address) ?? null)}</TableCell>
                <TableCell className="text-right tabular-nums" title={apr ? aprTitle(apr) : undefined}>
                  {apr?.navApr == null ? <span className="text-muted-foreground/60">-</span> : <span className="font-medium">{pct(apr.navApr)}</span>}
                  {apr?.apr != null && (
                    <div className="text-xs text-muted-foreground">{pct(apr.apr)} fees</div>
                  )}
                </TableCell>
                <TableCell>
                  <span className={`inline-flex items-center gap-1.5 whitespace-nowrap ${s.text}`}>
                    <span className={`h-2 w-2 rounded-full ${s.dot}`} aria-hidden />
                    {s.label}
                  </span>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
