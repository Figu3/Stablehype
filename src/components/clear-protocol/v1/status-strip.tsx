import type { ClearV1Overview } from "@/hooks/use-clear-v1";
import { formatAge } from "../format";
import { feedStale } from "./helpers";

type Tone = "ok" | "warn" | "bad";
interface Alert { text: string; detail?: string; tone: Tone }

const DOT: Record<Tone, string> = { ok: "bg-emerald-500", warn: "bg-amber-500", bad: "bg-rose-500" };
const FRAME: Record<Tone, string> = {
  ok: "border-border bg-card",
  warn: "border-amber-500/40 bg-amber-500/10",
  bad: "border-rose-500/40 bg-rose-500/10",
};

/** What needs attention now. Only exceptions are listed, so a healthy protocol shows one line. */
export function protocolAlerts(overview: ClearV1Overview): Alert[] {
  const state = overview.state;
  if (!state) return [];
  const staleFeeds = state.feeds.filter((f) => feedStale(f, state.updatedAt));
  const oldest = Math.min(...staleFeeds.map((f) => f.lastUpdate as number));
  return [
    ...state.reserves.filter((r) => r.paused).map((r) => ({ text: `${r.label} paused`, tone: "bad" as const })),
    ...(staleFeeds.length > 0
      ? [{
          text: `${staleFeeds.length} of ${state.feeds.length} oracles stale`,
          detail: `${staleFeeds.map((f) => f.symbol).join(", ")}, oldest update ${formatAge(state.updatedAt - oldest)} old when read`,
          tone: "bad" as const,
        }]
      : []),
    ...state.reserves
      .filter((r) => r.rebalanceNeeded)
      .map((r) => ({ text: `${r.label} needs rebalance`, tone: "warn" as const })),
  ];
}

/** The state of the protocol in one line: what is wrong and since when, or a quiet all-clear. */
export function StatusStrip({ overview, stale, now }: { overview: ClearV1Overview; stale: boolean; now: number }) {
  const alerts = protocolAlerts(overview);
  if (stale) alerts.unshift({ text: "Data is stale", detail: "the indexer has not synced in 30 minutes", tone: "warn" });
  const items: Alert[] = alerts.length > 0 ? alerts : [{ text: "All reserves live, all oracles fresh", tone: "ok" }];
  const worst: Tone = items.some((a) => a.tone === "bad") ? "bad" : items.some((a) => a.tone === "warn") ? "warn" : "ok";
  return (
    <div role="status" className={`flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-lg border px-4 py-2.5 text-sm ${FRAME[worst]}`}>
      {items.map((a) => (
        <span key={a.text} className="inline-flex items-baseline gap-2">
          <span className={`h-2 w-2 shrink-0 self-center rounded-full ${DOT[a.tone]}`} aria-hidden />
          <span className="font-medium">{a.text}</span>
          {a.detail && <span className="text-xs text-muted-foreground">{a.detail}</span>}
        </span>
      ))}
      {overview.updatedAt !== null && (
        <span className="ml-auto text-xs text-muted-foreground">Synced {formatAge(now - overview.updatedAt)}</span>
      )}
    </div>
  );
}
