"use client";

import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { EfficiencyPoint } from "@/lib/analytics";

const config = {
  decoupling: { label: "Decoupling", color: "var(--chart-3)" },
} satisfies ChartConfig;

const dayFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

function formatDay(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return dayFormat.format(new Date(year, month - 1, day));
}

/**
 * Aerobic decoupling per run: how much the pace-to-heart-rate ratio drifted
 * between the first and second half. Under 5% is generally considered a
 * well-controlled aerobic effort, so that threshold is drawn in.
 */
export function DecouplingChart({ data }: { data: EfficiencyPoint[] }) {
  const points = data.filter((point) => point.decoupling != null);

  return (
    <ChartContainer config={config} className="h-64 w-full">
      <BarChart data={points} margin={{ left: 4, right: 4, top: 8 }}>
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
          tickLine={false}
          axisLine={false}
          width={40}
          tickFormatter={(value: number) => `${value}%`}
        />
        <ReferenceLine y={5} stroke="var(--chart-5)" strokeDasharray="4 3" />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(label) => formatDay(String(label))}
              formatter={(value) => (
                <span className="flex w-full justify-between gap-3">
                  <span className="text-muted-foreground">Decoupling</span>
                  <span className="font-mono font-medium tabular-nums">
                    {Number(value).toFixed(1)}%
                  </span>
                </span>
              )}
            />
          }
        />
        <Bar dataKey="decoupling" radius={[3, 3, 0, 0]}>
          {points.map((point) => (
            <Cell
              key={point.id}
              fill={
                (point.decoupling ?? 0) > 5 ? "var(--chart-5)" : "var(--color-decoupling)"
              }
            />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
