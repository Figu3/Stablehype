import { ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { DEAD_STABLECOINS, CAUSE_META } from "@/lib/dead-stablecoins";
import { formatCurrency, formatDeathDate } from "@/lib/format";
import type { CauseOfDeath } from "@/lib/types";

export function StablecoinCemetery() {
  const byPeg = new Map<string, number>();
  const byCause = new Map<CauseOfDeath, number>();
  let totalDestroyed = 0;

  for (const coin of DEAD_STABLECOINS) {
    byPeg.set(coin.pegCurrency, (byPeg.get(coin.pegCurrency) ?? 0) + 1);
    byCause.set(coin.causeOfDeath, (byCause.get(coin.causeOfDeath) ?? 0) + 1);
    if (coin.peakMcap) totalDestroyed += coin.peakMcap;
  }

  return (
    <Card className="rounded-2xl border-l-[3px] border-l-zinc-500">
      <CardContent className="space-y-5 pt-6">
        {/* Mini stats */}
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-medium font-mono tabular-nums">
            {DEAD_STABLECOINS.length} dead
          </span>
          <span className="inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-medium font-mono tabular-nums text-red-500 border-red-500/30">
            {formatCurrency(totalDestroyed, 1)} peak destroyed
          </span>
          {Array.from(byPeg.entries()).map(([peg, count]) => (
            <span
              key={peg}
              className="inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-medium font-mono tabular-nums text-muted-foreground"
            >
              {count} {peg}
            </span>
          ))}
        </div>

        {/* Obituary list */}
        <div className="rounded-xl border divide-y divide-border">
          {DEAD_STABLECOINS.map((coin) => {
            const cause = CAUSE_META[coin.causeOfDeath];
            return (
              <div key={coin.symbol} id={`obituary-${coin.symbol}`} className="px-4 py-3.5 space-y-1.5 transition-all duration-500">
                {/* Row 1: symbol, death date, peak mcap, cause badge */}
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-semibold line-through decoration-zinc-500">
                      {coin.symbol}
                    </span>
                    <span className="text-sm">☠️</span>
                    <span className="text-sm font-mono tabular-nums text-muted-foreground">
                      {formatDeathDate(coin.deathDate)}
                    </span>
                    {coin.peakMcap && (
                      <span className="text-xs font-mono tabular-nums text-muted-foreground/60">
                        peak {formatCurrency(coin.peakMcap, 1)}
                      </span>
                    )}
                  </div>
                  <span
                    className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${cause.color}`}
                  >
                    {cause.label}
                  </span>
                </div>

                {/* Row 2: name + peg */}
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">{coin.name}</span>
                  <span className="text-xs font-mono text-muted-foreground/60">
                    {coin.pegCurrency}
                  </span>
                </div>

                {/* Row 3: obituary */}
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {coin.obituary}
                </p>

                {/* Row 4: source link */}
                <a
                  href={coin.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {coin.sourceLabel}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
