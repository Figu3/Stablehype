"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StablecoinLogo } from "@/components/stablecoin-logo";
import { formatEventDate, formatWorstDeviation } from "@/lib/format";
import type { DepegEvent } from "@/lib/types";

interface DepegTimelineProps {
  events: DepegEvent[];
  logos?: Record<string, string>;
}

type TimeRange = "1M" | "3M" | "1Y" | "ALL";

const LANE_HEIGHT = 32;
const LABEL_WIDTH = 100;
const PADDING_TOP = 32;

function severityColor(absBps: number): string {
  if (absBps >= 500) return "#ef4444";
  if (absBps >= 200) return "#f97316";
  return "#f59e0b";
}

function getTimeRange(range: TimeRange, now: number): number {
  switch (range) {
    case "1M": return now - 30 * 86400;
    case "3M": return now - 90 * 86400;
    case "1Y": return now - 365 * 86400;
    case "ALL": return now - 4 * 365.25 * 86400;
  }
}

export function DepegTimeline({ events, logos }: DepegTimelineProps) {
  const [range, setRange] = useState<TimeRange>("1Y");
  const [hoveredEvent, setHoveredEvent] = useState<DepegEvent | null>(null);
  const [now] = useState(() => Math.floor(Date.now() / 1000));

  const { lanes, startSec, endSec } = useMemo(() => {
    const start = getTimeRange(range, now);
    const end = now;

    // Filter events that overlap the visible range
    const visible = events.filter((e) => {
      const eEnd = e.endedAt ?? now;
      return eEnd > start && e.startedAt < end;
    });

    // Group by symbol (preserving order by earliest event)
    const laneMap = new Map<string, { symbol: string; id: string; events: DepegEvent[] }>();
    for (const e of visible) {
      if (!laneMap.has(e.symbol)) {
        laneMap.set(e.symbol, { symbol: e.symbol, id: e.stablecoinId, events: [] });
      }
      laneMap.get(e.symbol)!.events.push(e);
    }

    return {
      lanes: Array.from(laneMap.values()),
      startSec: start,
      endSec: end,
    };
  }, [events, range, now]);

  const timeSpan = endSec - startSec;

  // Generate time axis ticks
  const ticks = useMemo(() => {
    const result: { label: string; pct: number }[] = [];
    const startDate = new Date(startSec * 1000);
    const endDate = new Date(endSec * 1000);

    const step = range === "ALL" ? 12 : range === "1Y" ? 3 : 1;
    const d = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    while (d <= endDate) {
      const sec = d.getTime() / 1000;
      if (sec >= startSec && sec <= endSec) {
        const pct = ((sec - startSec) / timeSpan) * 100;
        const label = step >= 12
          ? d.getFullYear().toString()
          : d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
        result.push({ label, pct });
      }
      d.setMonth(d.getMonth() + step);
    }
    return result;
  }, [startSec, endSec, timeSpan, range]);

  const svgHeight = PADDING_TOP + lanes.length * LANE_HEIGHT + 8;

  if (events.length === 0) return null;

  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Depeg Timeline
          </CardTitle>
          <div className="flex gap-1">
            {(["1M", "3M", "1Y", "ALL"] as TimeRange[]).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                  range === r
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-accent/50"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {lanes.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No depeg events in this time range
          </p>
        ) : (
          <div className="overflow-x-auto">
            <div className="flex min-w-[600px]">
              {/* Lane labels */}
              <div className="flex-shrink-0" style={{ width: LABEL_WIDTH }}>
                <div style={{ height: PADDING_TOP }} />
                {lanes.map((lane) => (
                  <Link
                    key={lane.id}
                    href={`/stablecoin/${lane.id}`}
                    className="flex items-center gap-1.5 h-8 text-xs font-medium hover:underline"
                  >
                    <StablecoinLogo src={logos?.[lane.id]} name={lane.symbol} size={16} />
                    <span className="truncate">{lane.symbol}</span>
                  </Link>
                ))}
              </div>

              {/* SVG chart area */}
              <div className="flex-1 relative">
                <svg
                  width="100%"
                  height={svgHeight}
                  className="w-full"
                  preserveAspectRatio="none"
                  viewBox={`0 0 1000 ${svgHeight}`}
                >
                  {/* Time axis ticks */}
                  {ticks.map((t, i) => (
                    <g key={i}>
                      <line
                        x1={t.pct * 10}
                        x2={t.pct * 10}
                        y1={PADDING_TOP - 4}
                        y2={svgHeight}
                        stroke="currentColor"
                        strokeOpacity={0.1}
                        strokeWidth={1}
                      />
                      <text
                        x={t.pct * 10}
                        y={PADDING_TOP - 10}
                        textAnchor="middle"
                        className="fill-muted-foreground"
                        fontSize={10}
                      >
                        {t.label}
                      </text>
                    </g>
                  ))}

                  {/* Event bars */}
                  {lanes.map((lane, laneIdx) =>
                    lane.events.map((evt) => {
                      const now = Math.floor(Date.now() / 1000);
                      const evtStart = Math.max(evt.startedAt, startSec);
                      const evtEnd = Math.min(evt.endedAt ?? now, endSec);
                      const x = ((evtStart - startSec) / timeSpan) * 1000;
                      const w = Math.max(((evtEnd - evtStart) / timeSpan) * 1000, 3);
                      const y = PADDING_TOP + laneIdx * LANE_HEIGHT + 4;
                      const h = LANE_HEIGHT - 8;
                      const color = severityColor(Math.abs(evt.peakDeviationBps));
                      const isOngoing = evt.endedAt === null;

                      return (
                        <rect
                          key={evt.id}
                          x={x}
                          y={y}
                          width={w}
                          height={h}
                          rx={3}
                          fill={color}
                          fillOpacity={0.7}
                          stroke={color}
                          strokeWidth={isOngoing ? 2 : 0}
                          strokeDasharray={isOngoing ? "4 2" : undefined}
                          className="cursor-pointer transition-opacity hover:opacity-100"
                          opacity={hoveredEvent?.id === evt.id ? 1 : 0.7}
                          onMouseEnter={() => setHoveredEvent(evt)}
                          onMouseLeave={() => setHoveredEvent(null)}
                        />
                      );
                    })
                  )}
                </svg>

                {/* Tooltip */}
                {hoveredEvent && (
                  <div className="absolute top-2 right-2 bg-popover border rounded-lg p-3 shadow-lg text-xs space-y-1 z-20 pointer-events-none">
                    <p className="font-semibold">{hoveredEvent.symbol}</p>
                    <p>
                      {formatEventDate(hoveredEvent.startedAt)}
                      {hoveredEvent.endedAt
                        ? ` \u2014 ${formatEventDate(hoveredEvent.endedAt)}`
                        : " \u2014 ongoing"}
                    </p>
                    <p className="font-mono">
                      Peak: {formatWorstDeviation(hoveredEvent.peakDeviationBps)}
                    </p>
                    <p className="text-muted-foreground">
                      {hoveredEvent.direction === "above" ? "Above" : "Below"} peg
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
