"use client";

import { useMemo, useState, type ReactElement } from "react";
import { ExternalLink, Bot } from "lucide-react";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { KPICard } from "./kpi-card";
import { useSeveStats, useSeveRecent, type SeveEventRow } from "@/hooks/use-seve";

const SEVE_ADDRESS = "0x82675acFdaB818CE7B056d10Aaa68Da40B6D7621";
const SEVE_GH = "https://github.com/Figu3/seve";

function n(x: number | null | undefined): number {
  return typeof x === "number" && Number.isFinite(x) ? x : 0;
}

function fmtAge(iso: string): string {
  const sec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (sec < 60)    return `${sec}s ago`;
  if (sec < 3600)  return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
}

function kindBadge(kind: SeveEventRow["kind"]): ReactElement {
  const cls = {
    tick:        "bg-muted/40 text-muted-foreground",
    opportunity: "bg-violet-500/15 text-violet-300",
    submit:      "bg-emerald-500/15 text-emerald-300",
    error:       "bg-rose-500/15 text-rose-300",
  }[kind];
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-wide ${cls}`}>
      {kind}
    </span>
  );
}

export function SeveSection() {
  const stats  = useSeveStats();
  const [tab, setTab] = useState<"all" | "opportunity" | "submit" | "error">("all");
  const recent = useSeveRecent(tab === "all" ? undefined : tab, 50);

  // Pull counts by kind for the last 24h
  const counts24h = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of stats.data?.countsByKind24h ?? []) map.set(c.kind, c.n_24h);
    return map;
  }, [stats.data]);

  const ticks24h        = counts24h.get("tick") ?? 0;
  const oppsTotal       = stats.data?.opportunities.total ?? 0;
  const oppsProfitable  = stats.data?.opportunities.profitable ?? 0;
  const submitsTotal    = stats.data?.submits.total_submits ?? 0;
  const submitsLive     = stats.data?.submits.live_submits ?? 0;
  const latest          = stats.data?.latestTick ?? null;
  const isLoading       = stats.isLoading && !stats.data;

  return (
    <div className="space-y-3">
      {/* Header row */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-violet-400" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Sève
          </h3>
          <span className="text-[10px] text-muted-foreground/80">
            Protocol-aligned arb bot
          </span>
        </div>
        <div className="flex items-center gap-3 text-[10px]">
          <a
            href={`https://etherscan.io/address/${SEVE_ADDRESS}`}
            target="_blank" rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
          >
            Contract <ExternalLink className="h-3 w-3" />
          </a>
          <a
            href={SEVE_GH}
            target="_blank" rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
          >
            Source <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <KPICard
          label="Latest Block"
          value={latest ? latest.block_number.toLocaleString() : null}
          sub={latest ? `${fmtAge(latest.ts)} · ${latest.abs_depeg_bps_max.toFixed(2)} bps depeg` : "no data"}
          accent="blue"
          isLoading={isLoading}
        />
        <KPICard
          label="Ticks (24h)"
          value={isLoading ? null : ticks24h.toLocaleString()}
          sub="bot still alive?"
          accent="violet"
          isLoading={isLoading}
        />
        <KPICard
          label="Opportunities"
          value={isLoading ? null : oppsTotal.toLocaleString()}
          sub={
            oppsTotal > 0
              ? `${oppsProfitable} profitable · ${((n(oppsProfitable) / oppsTotal) * 100).toFixed(0)}% hit rate`
              : "Clear gate closed"
          }
          accent="emerald"
          isLoading={isLoading}
        />
        <KPICard
          label="Submits"
          value={isLoading ? null : submitsTotal.toLocaleString()}
          sub={
            submitsTotal > 0
              ? `${submitsLive} live · ${submitsTotal - submitsLive} dry-run`
              : "DRY_RUN soak"
          }
          accent="green"
          isLoading={isLoading}
        />
      </div>

      {/* Recent events */}
      <Card>
        <CardHeader className="pb-1.5 flex-row items-center justify-between">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Recent events
          </CardTitle>
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList variant="line">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="opportunity">Opps</TabsTrigger>
              <TabsTrigger value="submit">Submits</TabsTrigger>
              <TabsTrigger value="error">Errors</TabsTrigger>
            </TabsList>
            {/* TabsContent values exist so radix doesn't warn; the table reacts to `tab` directly */}
            <TabsContent value="all" />
            <TabsContent value="opportunity" />
            <TabsContent value="submit" />
            <TabsContent value="error" />
          </Tabs>
        </CardHeader>
        <CardContent className="pt-0">
          {recent.isLoading && !recent.data ? (
            <div className="h-40 bg-muted/30 rounded animate-pulse" />
          ) : (recent.data?.events.length ?? 0) === 0 ? (
            <div className="text-xs text-muted-foreground py-6 text-center">
              No {tab === "all" ? "events" : tab + " events"} yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono">
                <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  <tr className="border-b border-border/30">
                    <th className="text-left py-1.5 pr-2">Time</th>
                    <th className="text-left py-1.5 pr-2">Kind</th>
                    <th className="text-left py-1.5 pr-2">Block</th>
                    <th className="text-left py-1.5 pr-2">Route</th>
                    <th className="text-right py-1.5 pr-2">Size</th>
                    <th className="text-right py-1.5 pr-2">Edge bps</th>
                    <th className="text-right py-1.5 pr-2">Net $</th>
                    <th className="text-right py-1.5">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {(recent.data?.events ?? []).map((e) => (
                    <tr key={e.event_id} className="border-b border-border/10 hover:bg-muted/20">
                      <td className="py-1 pr-2 text-muted-foreground" title={e.ts}>
                        {fmtTime(e.ts)}
                      </td>
                      <td className="py-1 pr-2">{kindBadge(e.kind)}</td>
                      <td className="py-1 pr-2 text-muted-foreground">
                        {e.block_number ? e.block_number.toLocaleString() : "—"}
                      </td>
                      <td className="py-1 pr-2 max-w-[280px] truncate" title={e.route ?? ""}>
                        {e.route ?? "—"}
                      </td>
                      <td className="py-1 pr-2 text-right">
                        {e.size_usd ? `$${e.size_usd.toLocaleString()}` : "—"}
                      </td>
                      <td className="py-1 pr-2 text-right">
                        {e.gross_edge_bps !== null ? e.gross_edge_bps.toFixed(2) : "—"}
                      </td>
                      <td className={`py-1 pr-2 text-right ${e.net_edge_usd !== null && e.net_edge_usd > 0 ? "text-emerald-400" : e.net_edge_usd !== null && e.net_edge_usd < 0 ? "text-rose-400" : "text-muted-foreground"}`}>
                        {e.net_edge_usd !== null ? e.net_edge_usd.toFixed(2) : "—"}
                      </td>
                      <td className="py-1 text-right max-w-[200px] truncate text-muted-foreground" title={e.error_message ?? ""}>
                        {e.kind === "submit" && e.dry_run ? "dry-run" :
                         e.kind === "submit" ? "live" :
                         e.kind === "error" ? (e.error_message ?? "").slice(0, 40) :
                         e.kind === "opportunity" && e.profitable ? "profitable" :
                         e.kind === "tick" && e.abs_depeg_bps_max !== null ? `${e.abs_depeg_bps_max.toFixed(1)} bps` :
                         "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
