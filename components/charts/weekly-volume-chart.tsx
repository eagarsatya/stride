"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatDurationCompact } from "@/lib/format";
import type { WeeklyVolumePoint } from "@/lib/queries";
import { distanceSuffix, kmToUnit, type DistanceUnit } from "@/lib/units";

const config = {
  distanceKm: { label: "Distance", color: "var(--chart-1)" },
} satisfies ChartConfig;

export function WeeklyVolumeChart({
  data,
  unit,
}: {
  data: WeeklyVolumePoint[];
  unit: DistanceUnit;
}) {
  const display = data.map((point) => ({
    ...point,
    distance: Number(kmToUnit(point.distanceKm, unit).toFixed(1)),
  }));

  return (
    <ChartContainer config={config} className="h-64 w-full">
      <BarChart data={display} margin={{ left: 4, right: 4, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          // Long histories would otherwise overlap the labels.
          interval="preserveStartEnd"
          minTickGap={24}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={36}
          tickFormatter={(value: number) => `${value}`}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(label, payload) => {
                const point = payload?.[0]?.payload as WeeklyVolumePoint | undefined;
                return point ? `Week of ${label} · ${point.runs} runs` : String(label);
              }}
              formatter={(value, _name, item) => {
                const point = item?.payload as WeeklyVolumePoint | undefined;
                return (
                  <span className="flex w-full justify-between gap-3">
                    <span className="text-muted-foreground">Distance</span>
                    <span className="font-mono font-medium tabular-nums">
                      {value} {distanceSuffix(unit)}
                      {point && point.movingTimeS > 0
                        ? ` · ${formatDurationCompact(point.movingTimeS)}`
                        : ""}
                    </span>
                  </span>
                );
              }}
            />
          }
        />
        <Bar dataKey="distance" fill="var(--color-distanceKm)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartContainer>
  );
}
