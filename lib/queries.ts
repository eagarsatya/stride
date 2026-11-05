import { and, desc, eq, gte, sql } from "drizzle-orm";

import { db } from "@/db";
import { activities, wellness } from "@/db/schema/app";
import { computeLongestStreak, computeStreak } from "@/lib/streak";

/**
 * `activities.start_date_local` is a timestamp without timezone holding the
 * runner's wall-clock time, so every bucket boundary is built as a plain
 * `YYYY-MM-DD` string. Comparing against a JS `Date` here would silently apply
 * the server's UTC offset and move runs between days.
 */
function isoDay(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Monday-based start of the week containing `date`. */
export function startOfWeek(date: Date): Date {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const weekday = (result.getDay() + 6) % 7; // Monday = 0
  result.setDate(result.getDate() - weekday);
  return result;
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Accepts a calendar day and rejects values JS would otherwise roll over. */
export function parseIsoDay(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = ISO_DAY.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }

  return isoDay(date);
}

export function nextIsoDay(iso: string): string {
  const parsed = parseIsoDay(iso);
  if (!parsed) return iso;
  const [year, month, day] = parsed.split("-").map(Number);
  return isoDay(new Date(year, month - 1, day + 1));
}

export type Totals = {
  runs: number;
  distanceM: number;
  movingTimeS: number;
  elevationM: number;
  /** Distance-weighted average pace, in seconds per kilometre. */
  paceSPerKm: number | null;
};

export type SummaryPeriods = {
  week: Totals;
  month: Totals;
  year: Totals;
  all: Totals;
  currentStreak: number;
  longestStreak: number;
};

function totalsFrom(row: {
  runs: number | null;
  distance: number | null;
  time: number | null;
  elevation: number | null;
}): Totals {
  const distanceM = row.distance ?? 0;
  const movingTimeS = row.time ?? 0;

  return {
    runs: row.runs ?? 0,
    distanceM,
    movingTimeS,
    elevationM: row.elevation ?? 0,
    // Derive pace from the aggregate rather than averaging per-run paces, which
    // would over-weight short runs.
    paceSPerKm: distanceM > 0 && movingTimeS > 0 ? (movingTimeS / distanceM) * 1000 : null,
  };
}

export async function getSummary(userId: string, now = new Date()): Promise<SummaryPeriods> {
  const weekStart = isoDay(startOfWeek(now));
  const monthStart = isoDay(new Date(now.getFullYear(), now.getMonth(), 1));
  const yearStart = isoDay(new Date(now.getFullYear(), 0, 1));

  const bucket = (from: string) => sql`${activities.startDateLocal} >= ${from}::timestamp`;

  const [row] = await db
    .select({
      weekRuns: sql<number>`count(*) filter (where ${bucket(weekStart)})::int`,
      weekDistance: sql<number>`coalesce(sum(${activities.distanceM}) filter (where ${bucket(weekStart)}), 0)::float8`,
      weekTime: sql<number>`coalesce(sum(${activities.movingTimeS}) filter (where ${bucket(weekStart)}), 0)::int`,
      weekElevation: sql<number>`coalesce(sum(${activities.elevationGainM}) filter (where ${bucket(weekStart)}), 0)::float8`,

      monthRuns: sql<number>`count(*) filter (where ${bucket(monthStart)})::int`,
      monthDistance: sql<number>`coalesce(sum(${activities.distanceM}) filter (where ${bucket(monthStart)}), 0)::float8`,
      monthTime: sql<number>`coalesce(sum(${activities.movingTimeS}) filter (where ${bucket(monthStart)}), 0)::int`,
      monthElevation: sql<number>`coalesce(sum(${activities.elevationGainM}) filter (where ${bucket(monthStart)}), 0)::float8`,

      yearRuns: sql<number>`count(*) filter (where ${bucket(yearStart)})::int`,
      yearDistance: sql<number>`coalesce(sum(${activities.distanceM}) filter (where ${bucket(yearStart)}), 0)::float8`,
      yearTime: sql<number>`coalesce(sum(${activities.movingTimeS}) filter (where ${bucket(yearStart)}), 0)::int`,
      yearElevation: sql<number>`coalesce(sum(${activities.elevationGainM}) filter (where ${bucket(yearStart)}), 0)::float8`,

      allRuns: sql<number>`count(*)::int`,
      allDistance: sql<number>`coalesce(sum(${activities.distanceM}), 0)::float8`,
      allTime: sql<number>`coalesce(sum(${activities.movingTimeS}), 0)::int`,
      allElevation: sql<number>`coalesce(sum(${activities.elevationGainM}), 0)::float8`,
    })
    .from(activities)
    .where(eq(activities.userId, userId));

  const runDays = await db
    .selectDistinct({
      day: sql<string>`to_char(${activities.startDateLocal}, 'YYYY-MM-DD')`,
    })
    .from(activities)
    .where(eq(activities.userId, userId))
    .orderBy(sql`1 desc`);

  const days = runDays.map((r) => r.day);

  return {
    week: totalsFrom({
      runs: row?.weekRuns ?? 0,
      distance: row?.weekDistance ?? 0,
      time: row?.weekTime ?? 0,
      elevation: row?.weekElevation ?? 0,
    }),
    month: totalsFrom({
      runs: row?.monthRuns ?? 0,
      distance: row?.monthDistance ?? 0,
      time: row?.monthTime ?? 0,
      elevation: row?.monthElevation ?? 0,
    }),
    year: totalsFrom({
      runs: row?.yearRuns ?? 0,
      distance: row?.yearDistance ?? 0,
      time: row?.yearTime ?? 0,
      elevation: row?.yearElevation ?? 0,
    }),
    all: totalsFrom({
      runs: row?.allRuns ?? 0,
      distance: row?.allDistance ?? 0,
      time: row?.allTime ?? 0,
      elevation: row?.allElevation ?? 0,
    }),
    currentStreak: computeStreak(days, now),
    longestStreak: computeLongestStreak(days),
  };
}

export type WeeklyVolumePoint = {
  weekStart: string;
  label: string;
  distanceKm: number;
  movingTimeS: number;
  runs: number;
};

/**
 * Weekly distance for the last `weeks` weeks, including weeks with no runs so
 * the chart shows gaps honestly instead of compressing them away.
 */
export async function getWeeklyVolume(
  userId: string,
  weeks = 16,
  now = new Date(),
): Promise<WeeklyVolumePoint[]> {
  const firstWeek = startOfWeek(addDays(startOfWeek(now), -7 * (weeks - 1)));

  const rows = await db
    .select({
      week: sql<string>`to_char(date_trunc('week', ${activities.startDateLocal}), 'YYYY-MM-DD')`,
      distance: sql<number>`coalesce(sum(${activities.distanceM}), 0)::float8`,
      time: sql<number>`coalesce(sum(${activities.movingTimeS}), 0)::int`,
      runs: sql<number>`count(*)::int`,
    })
    .from(activities)
    .where(
      and(
        eq(activities.userId, userId),
        sql`${activities.startDateLocal} >= ${isoDay(firstWeek)}::timestamp`,
      ),
    )
    .groupBy(sql`1`);

  const byWeek = new Map(rows.map((row) => [row.week, row]));
  const labelFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

  return Array.from({ length: weeks }, (_, index) => {
    const start = addDays(firstWeek, index * 7);
    const key = isoDay(start);
    const row = byWeek.get(key);

    return {
      weekStart: key,
      label: labelFormat.format(start),
      distanceKm: Number(((row?.distance ?? 0) / 1000).toFixed(1)),
      movingTimeS: row?.time ?? 0,
      runs: row?.runs ?? 0,
    };
  });
}

export type FitnessPoint = {
  date: string;
  ctl: number | null;
  atl: number | null;
  form: number | null;
};

/**
 * Fitness (CTL), fatigue (ATL) and form (CTL - ATL).
 *
 * Wellness rows are the preferred source because Intervals.icu records them for
 * every day, including rest days. Accounts without wellness data fall back to
 * the values carried on each activity, which only exist on days that have runs.
 */
export async function getFitnessSeries(
  userId: string,
  days = 180,
  now = new Date(),
): Promise<FitnessPoint[]> {
  const from = isoDay(addDays(now, -days));

  const wellnessRows = await db
    .select({
      date: wellness.date,
      ctl: wellness.ctl,
      atl: wellness.atl,
    })
    .from(wellness)
    .where(and(eq(wellness.userId, userId), gte(wellness.date, from)))
    .orderBy(wellness.date);

  const usable = wellnessRows.filter((row) => row.ctl !== null || row.atl !== null);

  if (usable.length > 0) {
    return usable.map((row) => ({
      date: row.date,
      ctl: row.ctl,
      atl: row.atl,
      form: row.ctl !== null && row.atl !== null ? row.ctl - row.atl : null,
    }));
  }

  const activityRows = await db
    .select({
      date: sql<string>`to_char(${activities.startDateLocal}, 'YYYY-MM-DD')`,
      ctl: sql<number | null>`max(${activities.ctl})`,
      atl: sql<number | null>`max(${activities.atl})`,
    })
    .from(activities)
    .where(
      and(
        eq(activities.userId, userId),
        sql`${activities.startDateLocal} >= ${from}::timestamp`,
      ),
    )
    .groupBy(sql`1`)
    .orderBy(sql`1`);

  return activityRows
    .filter((row) => row.ctl !== null || row.atl !== null)
    .map((row) => ({
      date: row.date,
      ctl: row.ctl,
      atl: row.atl,
      form: row.ctl !== null && row.atl !== null ? row.ctl - row.atl : null,
    }));
}

export type RunListItem = {
  id: string;
  name: string | null;
  type: string;
  startDateLocal: string;
  distanceM: number | null;
  movingTimeS: number | null;
  paceSPerKm: number | null;
  avgHr: number | null;
  elevationGainM: number | null;
  trainingLoad: number | null;
  isRace: boolean;
  isTreadmill: boolean;
  hasGps: boolean;
};

const RUN_LIST_COLUMNS = {
  id: activities.id,
  name: activities.name,
  type: activities.type,
  startDateLocal: activities.startDateLocal,
  distanceM: activities.distanceM,
  movingTimeS: activities.movingTimeS,
  paceSPerKm: activities.paceSPerKm,
  avgHr: activities.avgHr,
  elevationGainM: activities.elevationGainM,
  trainingLoad: activities.trainingLoad,
  isRace: activities.isRace,
  isTreadmill: activities.isTreadmill,
  hasGps: activities.hasGps,
} as const;

export async function getRecentRuns(userId: string, limit = 8): Promise<RunListItem[]> {
  return db
    .select(RUN_LIST_COLUMNS)
    .from(activities)
    .where(eq(activities.userId, userId))
    .orderBy(desc(activities.startDateLocal))
    .limit(limit);
}

export const ACTIVITY_RANGES = {
  "30d": { label: "Last 30 days", days: 30 },
  "90d": { label: "Last 90 days", days: 90 },
  "1y": { label: "Last 12 months", days: 365 },
  all: { label: "All time", days: null },
  custom: { label: "Custom range", days: null },
} as const;

export type ActivityRange = keyof typeof ACTIVITY_RANGES;

export type RangeBounds = {
  from: string | null;
  toExclusive: string | null;
};

/**
 * Inclusive calendar-day window for the activity list. Presets only bound the
 * start; a custom range may bound either end. `to` is stored inclusively in
 * filters and converted to an exclusive timestamp here so a run at 23:59 still
 * matches the last selected day.
 */
export function activityRangeBounds(
  filters: Pick<ActivityFilters, "range" | "from" | "to">,
  now = new Date(),
): RangeBounds {
  if (filters.range === "custom") {
    let from = parseIsoDay(filters.from);
    let to = parseIsoDay(filters.to);
    if (from && to && from > to) {
      [from, to] = [to, from];
    }

    return { from, toExclusive: to ? nextIsoDay(to) : null };
  }

  const days = ACTIVITY_RANGES[filters.range].days;
  if (days == null) return { from: null, toExclusive: null };

  return { from: isoDay(addDays(now, -days)), toExclusive: null };
}

export const ACTIVITY_SORTS = {
  date: { label: "Date", column: activities.startDateLocal },
  distance: { label: "Distance", column: activities.distanceM },
  time: { label: "Duration", column: activities.movingTimeS },
  pace: { label: "Pace", column: activities.paceSPerKm },
  hr: { label: "Avg HR", column: activities.avgHr },
  load: { label: "Load", column: activities.trainingLoad },
} as const;

export type ActivitySort = keyof typeof ACTIVITY_SORTS;

export type ActivityFilters = {
  range: ActivityRange;
  from: string | null;
  to: string | null;
  type: string;
  raceOnly: boolean;
  sort: ActivitySort;
  direction: "asc" | "desc";
  page: number;
  pageSize: number;
};

export const DEFAULT_FILTERS: ActivityFilters = {
  range: "90d",
  from: null,
  to: null,
  type: "all",
  raceOnly: false,
  sort: "date",
  direction: "desc",
  page: 1,
  pageSize: 25,
};

export async function getActivities(
  userId: string,
  filters: ActivityFilters,
  now = new Date(),
): Promise<{ items: RunListItem[]; total: number; pageCount: number }> {
  const conditions = [eq(activities.userId, userId)];

  const { from, toExclusive } = activityRangeBounds(filters, now);
  if (from) {
    conditions.push(sql`${activities.startDateLocal} >= ${from}::timestamp`);
  }
  if (toExclusive) {
    conditions.push(sql`${activities.startDateLocal} < ${toExclusive}::timestamp`);
  }

  if (filters.type !== "all") {
    conditions.push(eq(activities.type, filters.type));
  }

  if (filters.raceOnly) {
    conditions.push(eq(activities.isRace, true));
  }

  const where = and(...conditions);
  const column = ACTIVITY_SORTS[filters.sort].column;

  // NULLS LAST keeps runs missing the sorted metric out of the way instead of
  // filling the first page with blanks.
  const order =
    filters.direction === "asc"
      ? sql`${column} asc nulls last`
      : sql`${column} desc nulls last`;

  const [items, [countRow]] = await Promise.all([
    db
      .select(RUN_LIST_COLUMNS)
      .from(activities)
      .where(where)
      .orderBy(order, desc(activities.startDateLocal))
      .limit(filters.pageSize)
      .offset((filters.page - 1) * filters.pageSize),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(activities)
      .where(where),
  ]);

  const total = countRow?.count ?? 0;

  return {
    items,
    total,
    pageCount: Math.max(1, Math.ceil(total / filters.pageSize)),
  };
}

export async function getActivityDetail(userId: string, activityId: string) {
  const [activity] = await db
    .select()
    .from(activities)
    .where(and(eq(activities.id, activityId), eq(activities.userId, userId)))
    .limit(1);

  return activity ?? null;
}

/** Previous and next run by date, for detail-page navigation. */
export async function getActivityNeighbours(
  userId: string,
  startDateLocal: string,
): Promise<{ previousId: string | null; nextId: string | null }> {
  const [[previous], [next]] = await Promise.all([
    db
      .select({ id: activities.id })
      .from(activities)
      .where(
        and(
          eq(activities.userId, userId),
          sql`${activities.startDateLocal} < ${startDateLocal}::timestamp`,
        ),
      )
      .orderBy(desc(activities.startDateLocal))
      .limit(1),
    db
      .select({ id: activities.id })
      .from(activities)
      .where(
        and(
          eq(activities.userId, userId),
          sql`${activities.startDateLocal} > ${startDateLocal}::timestamp`,
        ),
      )
      .orderBy(sql`${activities.startDateLocal} asc`)
      .limit(1),
  ]);

  return { previousId: previous?.id ?? null, nextId: next?.id ?? null };
}

export { RUN_LIST_COLUMNS, isoDay };
