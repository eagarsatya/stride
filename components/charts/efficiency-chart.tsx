"use client";

import { CartesianGrid, ComposedChart, Line, Scatter, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { EfficiencyPoint } from "@/lib/analytics";
import { formatPace } from "@/lib/format";

const config = {
  paceSPerKm: { label: "Pace", color: "var(--chart-1)" },
  avgHr: { label: "Avg HR", color: "var(--chart-5)" },
} satisfies ChartConfig;

const dayFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

function formatDay(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return dayFormat.format(new Date(year, month - 1, day));
}

/**
 * Pace against heart rate over time. Pace trending faster while heart rate
 * holds steady is aerobic fitness improving.
 */
export function EfficiencyChart({ data }: { data: EfficiencyPoint[] }) {
  return (
    <ChartContainer config={config} className="h-72 w-full">
      <ComposedChart data={data} margin={{ left: 4, right: 4, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={40}
          tickFormatter={formatDay}
        />
        <YAxis
          yAxisId="pace"
          reversed
          domain={["dataMin - 15", "dataMax + 15"]}
          tickLine={false}
          axisLine={false}
          width={44}
          tickFormatter={(value: number) => formatPace(value)}
        />
        <YAxis
          yAxisId="hr"
          orientation="right"
          domain={["dataMin - 8", "dataMax + 8"]}
          tickLine={false}
          axisLine={false}
          width={36}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(label) => formatDay(String(label))}
              formatter={(value, name) => (
                <span className="flex w-full justify-between gap-3">
                  <span className="text-muted-foreground">
                    {name === "paceSPerKm" ? "Pace" : "Avg HR"}
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
        {/* Individual runs as dots, so a single session cannot be mistaken for a trend. */}
        <Scatter yAxisId="pace" dataKey="paceSPerKm" fill="var(--color-paceSPerKm)" />
        <Line
          yAxisId="hr"
          dataKey="avgHr"
          type="monotone"
          stroke="var(--color-avgHr)"
          strokeWidth={1.5}
          dot={false}
          connectNulls
        />
        <ChartLegend content={<ChartLegendContent />} />
      </ComposedChart>
    </ChartContainer>
  );
}
