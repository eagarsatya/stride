import Link from "next/link";

import { ActivityFilterBar } from "@/components/activity-filters";
import { ActivityTable } from "@/components/activity-table";
import { NoRunsState, NotConnectedState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getConnection } from "@/lib/connections";
import { formatDate, formatKm } from "@/lib/format";
import {
  ACTIVITY_RANGES,
  ACTIVITY_SORTS,
  DEFAULT_FILTERS,
  getActivities,
  parseIsoDay,
  type ActivityFilters,
  type ActivityRange,
  type ActivitySort,
} from "@/lib/queries";
import { getDistanceUnit } from "@/lib/settings";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Activities" };

function parseFilters(params: Record<string, string | string[] | undefined>): ActivityFilters {
  const single = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const range = single("range");
  const sort = single("sort");
  const direction = single("dir");
  const page = Number(single("page") ?? "1");
  const type = single("type") ?? DEFAULT_FILTERS.type;
  const resolvedRange =
    range && range in ACTIVITY_RANGES ? (range as ActivityRange) : DEFAULT_FILTERS.range;
  const custom = resolvedRange === "custom";

  return {
    range: resolvedRange,
    from: custom ? parseIsoDay(single("from")) : null,
    to: custom ? parseIsoDay(single("to")) : null,
    type: ["all", "Run", "TrailRun", "VirtualRun"].includes(type) ? type : "all",
    raceOnly: single("race") === "1",
    sort: sort && sort in ACTIVITY_SORTS ? (sort as ActivitySort) : DEFAULT_FILTERS.sort,
    direction: direction === "asc" ? "asc" : "desc",
    page: Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1,
    pageSize: DEFAULT_FILTERS.pageSize,
  };
}

function pageHref(filters: ActivityFilters, page: number) {
  const params = new URLSearchParams({
    range: filters.range,
    type: filters.type,
    sort: filters.sort,
    dir: filters.direction,
    page: String(page),
  });
  if (filters.raceOnly) params.set("race", "1");
  if (filters.range === "custom") {
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
  }

  return `/activities?${params.toString()}`;
}

function rangeLabel(filters: ActivityFilters): string {
  if (filters.range !== "custom") return ACTIVITY_RANGES[filters.range].label;
  if (filters.from && filters.to) return `${formatDate(filters.from)} – ${formatDate(filters.to)}`;
  if (filters.from) return `From ${formatDate(filters.from)}`;
  if (filters.to) return `Until ${formatDate(filters.to)}`;
  return ACTIVITY_RANGES.all.label;
}

export default async function ActivitiesPage({ searchParams }: PageProps<"/activities">) {
  const user = await requireUser();
  const filters = parseFilters(await searchParams);

  const [connection, { items, total, pageCount }, unit] = await Promise.all([
    getConnection(user.id),
    getActivities(user.id, filters),
    getDistanceUnit(user.id),
  ]);

  if (total === 0 && !connection) {
    return (
      <>
        <PageHeader title="Activities" />
        <NotConnectedState />
      </>
    );
  }

  const totalDistance = items.reduce((sum, run) => sum + (run.distanceM ?? 0), 0);

  return (
    <>
      <PageHeader
        title="Activities"
        description={
          total > 0
            ? `${total} runs · ${rangeLabel(filters)} · ${formatKm(totalDistance, 0, unit)} on this page`
            : undefined
        }
      />

      <div className="mb-4">
        <ActivityFilterBar filters={filters} />
      </div>

      {total === 0 ? (
        <NoRunsState message="No runs match these filters. Try widening the date range." />
      ) : (
        <Card>
          <CardContent className="px-0">
            <ActivityTable items={items} filters={filters} unit={unit} />
          </CardContent>
        </Card>
      )}

      {pageCount > 1 ? (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-muted-foreground text-sm">
            Page {filters.page} of {pageCount}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" disabled={filters.page <= 1} asChild={filters.page > 1}>
              {filters.page > 1 ? (
                <Link href={pageHref(filters, filters.page - 1)}>Previous</Link>
              ) : (
                <span>Previous</span>
              )}
            </Button>
            <Button
              variant="outline"
              disabled={filters.page >= pageCount}
              asChild={filters.page < pageCount}
            >
              {filters.page < pageCount ? (
                <Link href={pageHref(filters, filters.page + 1)}>Next</Link>
              ) : (
                <span>Next</span>
              )}
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}
