"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";

import { useBusyEffect } from "@/components/busy-overlay";
import { DateRangePicker } from "@/components/date-range-picker";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ACTIVITY_RANGES,
  activityRangeBounds,
  isoDay,
  type ActivityFilters,
} from "@/lib/queries";
import { cn } from "@/lib/utils";

const TYPES = [
  { value: "all", label: "All types" },
  { value: "Run", label: "Road" },
  { value: "TrailRun", label: "Trail" },
  { value: "VirtualRun", label: "Virtual" },
];

export function ActivityFilterBar({ filters }: { filters: ActivityFilters }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  useBusyEffect(pending, { message: "Updating filters…" });

  const update = useCallback(
    (changes: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());

      for (const [key, value] of Object.entries(changes)) {
        if (value === null) params.delete(key);
        else params.set(key, value);
      }

      // Any filter change invalidates the current page offset.
      if (!("page" in changes)) params.delete("page");

      startTransition(() => router.push(`/activities?${params.toString()}`));
    },
    [router, searchParams],
  );

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 transition-opacity",
        pending && "opacity-60",
      )}
    >
      <Select
        value={filters.range}
        onValueChange={(value) => {
          if (value === "custom") {
            const bounds = activityRangeBounds(filters);
            update({
              range: "custom",
              from: bounds.from ?? filters.from,
              to: filters.to ?? isoDay(new Date()),
            });
            return;
          }

          update({ range: value, from: null, to: null });
        }}
      >
        <SelectTrigger className="w-44" aria-label="Date range">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(ACTIVITY_RANGES).map(([value, { label }]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {filters.range === "custom" ? (
        <DateRangePicker
          from={filters.from}
          to={filters.to}
          onChange={({ from, to }) => update({ range: "custom", from, to })}
        />
      ) : null}

      <Select value={filters.type} onValueChange={(value) => update({ type: value })}>
        <SelectTrigger className="w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TYPES.map(({ value, label }) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button
        variant={filters.raceOnly ? "default" : "outline"}
        onClick={() => update({ race: filters.raceOnly ? null : "1" })}
      >
        Races only
      </Button>
    </div>
  );
}
