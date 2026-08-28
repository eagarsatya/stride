"use client";

import { CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatPace } from "@/lib/format";
import type { SeriesPoint } from "@/lib/splits";

const config = {
  paceSPerKm: { label: "Pace", color: "var(--chart-1)" },
  heartrate: { label: "Heart rate", color: "var(--chart-5)" },
} satisfies ChartConfig;

export function PaceHrChart({ data }: { data: SeriesPoint[] }) {
  const hasHr = data.some((point) => point.heartrate != null);

  return (
    <ChartContainer config={config} className="h-72 w-full">
      <ComposedChart data={data} margin={{ left: 4, right: 4, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="distanceKm"
          type="number"
          domain={[0, "dataMax"]}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          tickFormatter={(value: number) => `${value.toFixed(0)}k`}
        />
        <YAxis
          yAxisId="pace"
          // Reversed so a faster pace sits higher, which is how runners read it.
          reversed
          domain={["dataMin - 20", "dataMax + 20"]}
          tickLine={false}
          axisLine={false}
          width={44}
          tickFormatter={(value: number) => formatPace(value)}
        />
        {hasHr ? (
          <YAxis
            yAxisId="hr"
            orientation="right"
            domain={["dataMin - 10", "dataMax + 10"]}
            tickLine={false}
            axisLine={false}
            width={36}
          />
        ) : null}
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(label) => `${Number(label).toFixed(2)} km`}
              formatter={(value, name) => (
                <span className="flex w-full justify-between gap-3">
                  <span className="text-muted-foreground">
                    {name === "paceSPerKm" ? "Pace" : "Heart rate"}
                  </span>
                  <span className="font-mono font-medium tabular-nums">
                    {name === "paceSPerKm"
                      ? `${formatPace(Number(value))} /km`
                      : `${Math.round(Number(value))} bpm`}
                  </span>
                </span>
              )}
            />
          }
        />
        <Line
          yAxisId="pace"
          dataKey="paceSPerKm"
          type="monotone"
          stroke="var(--color-paceSPerKm)"
          strokeWidth={2}
          dot={false}
          connectNulls
        />
        {hasHr ? (
          <Line
            yAxisId="hr"
            dataKey="heartrate"
            type="monotone"
            stroke="var(--color-heartrate)"
            strokeWidth={1.5}
            dot={false}
            connectNulls
          />
        ) : null}
        <ChartLegend content={<ChartLegendContent />} />
      </ComposedChart>
    </ChartContainer>
  );
}
