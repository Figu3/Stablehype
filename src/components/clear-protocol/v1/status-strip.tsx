import type { ClearV1Overview } from "@/hooks/use-clear-v1";

type Tone = "ok" | "warn" | "bad";

const TONE: Record<Tone, string> = {
  ok: "bg-emerald-500/15 text-emerald-500",
  warn: "bg-amber-500/20 text-amber-500",
  bad: "bg-rose-500/20 text-rose-500",
};

/** What needs attention now. Only exceptions are listed, so a healthy protocol shows one chip. */
export function protocolAlerts(overview: ClearV1Overview, now: number): { text: string; tone: Tone }[] {
  const state = overview.state;
  if (!state) return [];
  const staleFeeds = state.feeds.filter((f) => f.lastUpdate !== null && f.ttl !== null && now - f.lastUpdate > f.ttl);
  return [
    ...state.reserves.filter((r) => r.paused).map((r) => ({ text: `${r.label} paused`, tone: "bad" as const })),
    ...(staleFeeds.length > 0
      ? [{ text: `${staleFeeds.length} of ${state.feeds.length} oracles stale`, tone: "bad" as const }]
      : []),
    ...state.reserves
      .filter((r) => r.rebalanceNeeded)
      .map((r) => ({ text: `${r.label} needs rebalance`, tone: "warn" as const })),
  ];
}

export function StatusStrip({ overview, stale, now }: { overview: ClearV1Overview; stale: boolean; now: number }) {
  const alerts = protocolAlerts(overview, now);
  if (stale) alerts.unshift({ text: "Stale data", tone: "warn" });
  const chips = alerts.length > 0 ? alerts : [{ text: "All reserves live", tone: "ok" as const }];
  return (
    <>
      {chips.map((c) => (
        <span key={c.text} className={`text-xs px-2 py-0.5 rounded ${TONE[c.tone]}`}>{c.text}</span>
      ))}
    </>
  );
}
