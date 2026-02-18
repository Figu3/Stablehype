"use client";

import { useEffect, useRef, useState } from "react";
import { createChart, type IChartApi, type ISeriesApi, LineSeries, ColorType } from "lightweight-charts";
import { useTheme } from "next-themes";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface PriceChartProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>[];
  pegType?: string;
  pegValue?: number;
}

export function PriceChart({ data, pegType = "peggedUSD", pegValue = 1 }: PriceChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const { theme } = useTheme();
  const [range, setRange] = useState<"7d" | "30d" | "90d" | "1y" | "all">("all");

  useEffect(() => {
    if (!chartContainerRef.current || !Array.isArray(data) || data.length === 0) return;

    const isDark = theme === "dark";

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: isDark ? "#a1a1aa" : "#71717a",
      },
      grid: {
        vertLines: { color: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)" },
        horzLines: { color: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)" },
      },
      width: chartContainerRef.current.clientWidth,
      height: 350,
      rightPriceScale: {
        borderVisible: false,
      },
      timeScale: {
        borderVisible: false,
      },
    });

    chartRef.current = chart;

    const series = chart.addSeries(LineSeries, {
      color: "#3b82f6",
      lineWidth: 2,
      priceFormat: { type: "price", precision: 4, minMove: 0.0001 },
    });
    seriesRef.current = series;

    // DefiLlama per-coin history only has circulating (native units), not USD values.
    // Aggregate data (stablecoincharts/all) has both totalCirculating and totalCirculatingUSD.
    // We compute implied price when both are available, otherwise fall back to pegValue.
    const chartData = data
      .map((point) => {
        const circUSD = (point.totalCirculatingUSD && typeof point.totalCirculatingUSD === "object")
          ? (point.totalCirculatingUSD[pegType] ?? 0) : 0;
        const circ = (point.totalCirculating && typeof point.totalCirculating === "object")
          ? (point.totalCirculating[pegType] ?? 0)
          : (point.circulating && typeof point.circulating === "object")
            ? (point.circulating[pegType] ?? 0) : 0;
        const price = circUSD > 0 && circ > 0 ? circUSD / circ : pegValue;
        return {
          time: (typeof point.date === "number"
            ? new Date(point.date * 1000).toISOString().split("T")[0]
            : String(point.date).split("T")[0]) as string,
          value: price,
        };
      })
      .filter((d) => d.value > 0 && d.value < pegValue * 2);

    const filteredChartData = (() => {
      if (range === "all") return chartData;
      const now = Date.now();
      const ms: Record<string, number> = {
        "7d": 7 * 86400000,
        "30d": 30 * 86400000,
        "90d": 90 * 86400000,
        "1y": 365 * 86400000,
      };
      const cutoff = new Date(now - ms[range]).toISOString().split("T")[0];
      return chartData.filter((d) => d.time >= cutoff);
    })();

    if (filteredChartData.length > 0) {
      series.setData(filteredChartData);
      chart.timeScale().fitContent();
    }

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, [data, theme, pegType, pegValue, range]);

  return (
    <Card className="rounded-2xl">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle as="h2">Implied Price History</CardTitle>
        <div className="flex gap-1">
          {(["7d", "30d", "90d", "1y", "all"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                range === r
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              {r === "all" ? "All" : r.toUpperCase()}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <div ref={chartContainerRef} className="w-full" aria-label="Implied price history chart" />
        {(!Array.isArray(data) || data.length === 0) && (
          <div className="flex h-[350px] items-center justify-center text-muted-foreground">
            No price data available
          </div>
        )}
      </CardContent>
    </Card>
  );
}
