"use client";

import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { useBusyEffect } from "@/components/busy-overlay";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatDateTime,
  formatDuration,
  formatElevation,
  formatInteger,
  formatKm,
  formatPace,
} from "@/lib/format";
import { ACTIVITY_SORTS, type ActivityFilters, type ActivitySort, type RunListItem } from "@/lib/queries";

const COLUMNS: Array<{
  key: ActivitySort | "name";
  label: string;
  sortable: boolean;
  align?: "right";
  className?: string;
}> = [
  { key: "name", label: "Run", sortable: false },
  { key: "date", label: "Date", sortable: true, className: "hidden md:table-cell" },
  { key: "distance", label: "Distance", sortable: true, align: "right" },
  { key: "time", label: "Time", sortable: true, align: "right" },
  { key: "pace", label: "Pace", sortable: true, align: "right" },
  { key: "hr", label: "Avg HR", sortable: true, align: "right", className: "hidden sm:table-cell" },
  {
    key: "load",
    label: "Load",
    sortable: true,
    align: "right",
    className: "hidden lg:table-cell",
  },
];

export function ActivityTable({
  items,
  filters,
}: {
  items: RunListItem[];
  filters: ActivityFilters;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  useBusyEffect(pending, { message: "Sorting…" });

  function sortBy(key: ActivitySort) {
    const params = new URLSearchParams(searchParams.toString());
    // Clicking the active column flips direction; a new column starts descending.
    const direction =
      filters.sort === key && filters.direction === "desc" ? "asc" : "desc";

    params.set("sort", key);
    params.set("dir", direction);
    params.delete("page");

    startTransition(() => router.push(`/activities?${params.toString()}`));
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {COLUMNS.map((column) => {
            const active = column.sortable && filters.sort === column.key;
            const Icon = !active
              ? ChevronsUpDown
              : filters.direction === "desc"
                ? ArrowDown
                : ArrowUp;

            return (
              <TableHead
                key={column.key}
                className={column.className}
                data-align={column.align}
              >
                {column.sortable ? (
                  <button
                    type="button"
                    onClick={() => sortBy(column.key as ActivitySort)}
                    aria-label={`Sort by ${ACTIVITY_SORTS[column.key as ActivitySort].label}`}
                    className={`hover:text-foreground inline-flex items-center gap-1 ${
                      column.align === "right" ? "w-full justify-end" : ""
                    } ${active ? "text-foreground" : ""}`}
                  >
                    {column.label}
                    <Icon className="size-3" />
                  </button>
                ) : (
                  column.label
                )}
              </TableHead>
            );
          })}
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((run) => (
          <TableRow key={run.id} className="group">
            <TableCell className="max-w-[16rem]">
              <Link href={`/activities/${run.id}`} className="block">
                <span className="group-hover:text-primary truncate font-medium">
                  {run.name?.trim() || "Untitled run"}
                </span>
                <span className="text-muted-foreground mt-0.5 flex items-center gap-1.5 text-xs md:hidden">
                  {formatDateTime(run.startDateLocal)}
                </span>
              </Link>
            </TableCell>
            <TableCell className="text-muted-foreground hidden text-sm md:table-cell">
              <div className="flex items-center gap-2">
                {formatDateTime(run.startDateLocal)}
                {run.isRace ? (
                  <Badge variant="secondary" className="text-[10px]">
                    Race
                  </Badge>
                ) : null}
              </div>
            </TableCell>
            <TableCell className="text-right font-mono tabular-nums">
              {formatKm(run.distanceM)}
            </TableCell>
            <TableCell className="text-right font-mono tabular-nums">
              {formatDuration(run.movingTimeS)}
            </TableCell>
            <TableCell className="text-right font-mono tabular-nums">
              {formatPace(run.paceSPerKm)}
            </TableCell>
            <TableCell className="hidden text-right font-mono tabular-nums sm:table-cell">
              {formatInteger(run.avgHr)}
            </TableCell>
            <TableCell className="text-muted-foreground hidden text-right font-mono tabular-nums lg:table-cell">
              {run.trainingLoad != null ? formatInteger(run.trainingLoad) : formatElevation(null)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
