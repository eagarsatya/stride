"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { FitnessPoint } from "@/lib/queries";

const config = {
  ctl: { label: "Fitness (CTL)", color: "var(--chart-2)" },
  atl: { label: "Fatigue (ATL)", color: "var(--chart-5)" },
  form: { label: "Form (CTL − ATL)", color: "var(--chart-1)" },
} satisfies ChartConfig;

const dayFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

function formatDay(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return dayFormat.format(new Date(year, month - 1, day));
}

export function FitnessChart({ data }: { data: FitnessPoint[] }) {
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
        <YAxis tickLine={false} axisLine={false} width={36} />
        {/* Form crossing zero is the fresh/fatigued boundary. */}
        <ReferenceLine y={0} stroke="var(--border)" strokeDasharray="3 3" />
        <ChartTooltip
          content={<ChartTooltipContent labelFormatter={(label) => formatDay(String(label))} />}
        />
        <Area
          dataKey="ctl"
          type="monotone"
          stroke="var(--color-ctl)"
          fill="var(--color-ctl)"
          fillOpacity={0.15}
          strokeWidth={2}
          dot={false}
          connectNulls
        />
        <Area
          dataKey="atl"
          type="monotone"
          stroke="var(--color-atl)"
          fill="var(--color-atl)"
          fillOpacity={0.1}
          strokeWidth={2}
          dot={false}
          connectNulls
        />
        <Line
          dataKey="form"
          type="monotone"
          stroke="var(--color-form)"
          strokeWidth={2}
          strokeDasharray="4 3"
          dot={false}
          connectNulls
        />
        <ChartLegend content={<ChartLegendContent />} />
      </ComposedChart>
    </ChartContainer>
  );
}
