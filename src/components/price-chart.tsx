"use client";

import { useEffect, useRef } from "react";
import { createChart, type IChartApi, type ISeriesApi, LineSeries, ColorType } from "lightweight-charts";
import { useTheme } from "next-themes";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface PriceChartProps {
  data: { date: string; totalCirculating: Record<string, number>; totalCirculatingUSD: Record<string, number> }[];
  pegValue?: number;
}

export function PriceChart({ data, pegValue = 1 }: PriceChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const { theme } = useTheme();

  useEffect(() => {
    if (!chartContainerRef.current || !data?.length) return;

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

    // DefiLlama stablecoin history gives circulating supply, not price.
    // We can derive an approximate "implied price" from totalCirculatingUSD / totalCirculating
    const chartData = data
      .map((point) => {
        const circUSD = point.totalCirculatingUSD?.peggedUSD ?? 0;
        const circ = point.totalCirculating?.peggedUSD ?? 0;
        const price = circ > 0 ? circUSD / circ : pegValue;
        return {
          time: point.date.split("T")[0] as string,
          value: price,
        };
      })
      .filter((d) => d.value > 0 && d.value < 2);

    if (chartData.length > 0) {
      series.setData(chartData);
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
  }, [data, theme, pegValue]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Implied Price History</CardTitle>
      </CardHeader>
      <CardContent>
        <div ref={chartContainerRef} className="w-full" />
        {(!data || data.length === 0) && (
          <div className="flex h-[350px] items-center justify-center text-muted-foreground">
            No price data available
          </div>
        )}
      </CardContent>
    </Card>
  );
}
