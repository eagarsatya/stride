"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatDurationCompact } from "@/lib/format";
import type { MonthlyVolumePoint } from "@/lib/analytics";

const config = {
  distanceKm: { label: "Distance", color: "var(--chart-2)" },
} satisfies ChartConfig;

export function MonthlyVolumeChart({ data }: { data: MonthlyVolumePoint[] }) {
  return (
    <ChartContainer config={config} className="h-72 w-full">
      <BarChart data={data} margin={{ left: 4, right: 4, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          interval="preserveStartEnd"
          minTickGap={20}
        />
        <YAxis tickLine={false} axisLine={false} width={40} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(label, payload) => {
                const point = payload?.[0]?.payload as MonthlyVolumePoint | undefined;
                return point ? `${label} · ${point.runs} runs` : String(label);
              }}
              formatter={(value, _name, item) => {
                const point = item?.payload as MonthlyVolumePoint | undefined;
                return (
                  <span className="flex w-full flex-col gap-0.5">
                    <span className="flex justify-between gap-3">
                      <span className="text-muted-foreground">Distance</span>
                      <span className="font-mono font-medium tabular-nums">{value} km</span>
                    </span>
                    {point ? (
                      <span className="flex justify-between gap-3">
                        <span className="text-muted-foreground">Time</span>
                        <span className="font-mono tabular-nums">
                          {formatDurationCompact(point.movingTimeS)}
                        </span>
                      </span>
                    ) : null}
                  </span>
                );
              }}
            />
          }
        />
        <Bar dataKey="distanceKm" fill="var(--color-distanceKm)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartContainer>
  );
}
