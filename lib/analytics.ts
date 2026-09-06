import { and, desc, eq, isNotNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { activities } from "@/db/schema/app";
import { addDays, isoDay } from "@/lib/queries";
import { PR_DISTANCES, rankPersonalRecords, type PersonalRecord } from "@/lib/records";

export type { PersonalRecord };

export type MonthlyVolumePoint = {
  month: string;
  label: string;
  distanceKm: number;
  movingTimeS: number;
  runs: number;
  elevationM: number;
};

const MONTH_LABEL = new Intl.DateTimeFormat("en-GB", { month: "short", year: "2-digit" });

export async function getMonthlyVolume(
  userId: string,
  months = 24,
  now = new Date(),
): Promise<MonthlyVolumePoint[]> {
  const first = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);

  const rows = await db
    .select({
      month: sql<string>`to_char(date_trunc('month', ${activities.startDateLocal}), 'YYYY-MM')`,
      distance: sql<number>`coalesce(sum(${activities.distanceM}), 0)::float8`,
      time: sql<number>`coalesce(sum(${activities.movingTimeS}), 0)::int`,
      elevation: sql<number>`coalesce(sum(${activities.elevationGainM}), 0)::float8`,
      runs: sql<number>`count(*)::int`,
    })
    .from(activities)
    .where(
      and(
        eq(activities.userId, userId),
        sql`${activities.startDateLocal} >= ${isoDay(first)}::timestamp`,
      ),
    )
    .groupBy(sql`1`);

  const byMonth = new Map(rows.map((row) => [row.month, row]));

  // Emit every month in the window so quiet months are visible as gaps.
  return Array.from({ length: months }, (_, index) => {
    const date = new Date(first.getFullYear(), first.getMonth() + index, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const row = byMonth.get(key);

    return {
      month: key,
      label: MONTH_LABEL.format(date),
      distanceKm: Number(((row?.distance ?? 0) / 1000).toFixed(1)),
      movingTimeS: row?.time ?? 0,
      runs: row?.runs ?? 0,
      elevationM: Math.round(row?.elevation ?? 0),
    };
  });
}

export type EfficiencyPoint = {
  id: string;
  date: string;
  paceSPerKm: number | null;
  avgHr: number | null;
  /** Metres covered per heartbeat-second: higher is more aerobically efficient. */
  efficiencyFactor: number | null;
  decoupling: number | null;
  distanceKm: number;
};

/**
 * Per-run aerobic efficiency, restricted to steady runs long enough to be
 * comparable. Short or hard sessions would otherwise dominate the trend.
 */
export async function getEfficiencyTrend(
  userId: string,
  days = 365,
  now = new Date(),
): Promise<EfficiencyPoint[]> {
  const rows = await db
    .select({
      id: activities.id,
      date: sql<string>`to_char(${activities.startDateLocal}, 'YYYY-MM-DD')`,
      paceSPerKm: activities.paceSPerKm,
      avgHr: activities.avgHr,
      efficiencyFactor: activities.efficiencyFactor,
      decoupling: activities.decoupling,
      distanceM: activities.distanceM,
    })
    .from(activities)
    .where(
      and(
        eq(activities.userId, userId),
        sql`${activities.startDateLocal} >= ${isoDay(addDays(now, -days))}::timestamp`,
        isNotNull(activities.avgHr),
        isNotNull(activities.paceSPerKm),
        sql`${activities.distanceM} >= 3000`,
      ),
    )
    .orderBy(activities.startDateLocal);

  return rows.map((row) => ({
    id: row.id,
    date: row.date,
    paceSPerKm: row.paceSPerKm,
    avgHr: row.avgHr,
    efficiencyFactor: row.efficiencyFactor,
    decoupling: row.decoupling,
    distanceKm: Number(((row.distanceM ?? 0) / 1000).toFixed(1)),
  }));
}

/** Total seconds spent in each heart-rate zone over a window. */
export async function getZoneTotals(
  userId: string,
  days = 90,
  now = new Date(),
): Promise<{ hr: number[]; pace: number[] }> {
  const rows = await db
    .select({
      hrZoneTimes: activities.hrZoneTimes,
      paceZoneTimes: activities.paceZoneTimes,
    })
    .from(activities)
    .where(
      and(
        eq(activities.userId, userId),
        sql`${activities.startDateLocal} >= ${isoDay(addDays(now, -days))}::timestamp`,
      ),
    );

  const accumulate = (series: Array<number[] | null>) => {
    const totals: number[] = [];
    for (const zones of series) {
      if (!Array.isArray(zones)) continue;
      zones.forEach((seconds, index) => {
        if (!Number.isFinite(seconds)) return;
        totals[index] = (totals[index] ?? 0) + seconds;
      });
    }
    return totals;
  };

  return {
    hr: accumulate(rows.map((row) => row.hrZoneTimes ?? null)),
    pace: accumulate(rows.map((row) => row.paceZoneTimes ?? null)),
  };
}

export type LongestRun = {
  activityId: string;
  name: string | null;
  date: string;
  distanceM: number;
  movingTimeS: number | null;
  paceSPerKm: number | null;
};

export type VolumePeriod = {
  key: string;
  distanceM: number;
  runs: number;
};

export type ElevationRecord = {
  activityId: string;
  name: string | null;
  date: string;
  elevationM: number;
  distanceM: number | null;
};

export type RecordsSummary = {
  personalRecords: PersonalRecord[];
  personalRecordLists: Record<string, PersonalRecord[]>;
  analyzed: number;
  pendingAnalysis: number;
  longestRuns: LongestRun[];
  biggestWeeks: VolumePeriod[];
  biggestMonths: VolumePeriod[];
  mostElevation: ElevationRecord[];
  races: Array<{
    activityId: string;
    name: string | null;
    date: string;
    distanceM: number | null;
    movingTimeS: number | null;
    paceSPerKm: number | null;
  }>;
};

export async function getRecords(userId: string): Promise<RecordsSummary> {
  const [efforts, counts, longest, elevation, weeks, months, races] = await Promise.all([
    db
      .select({
        id: activities.id,
        name: activities.name,
        date: sql<string>`to_char(${activities.startDateLocal}, 'YYYY-MM-DD')`,
        isRace: activities.isRace,
        bestEfforts: activities.bestEfforts,
      })
      .from(activities)
      .where(and(eq(activities.userId, userId), isNotNull(activities.bestEfforts))),

    db
      .select({
        analyzed: sql<number>`count(*) filter (where ${activities.bestEffortsAt} is not null)::int`,
        pending: sql<number>`count(*) filter (where ${activities.bestEffortsAt} is null and ${activities.distanceM} >= 1000)::int`,
      })
      .from(activities)
      .where(eq(activities.userId, userId)),

    db
      .select({
        id: activities.id,
        name: activities.name,
        date: sql<string>`to_char(${activities.startDateLocal}, 'YYYY-MM-DD')`,
        distanceM: activities.distanceM,
        movingTimeS: activities.movingTimeS,
        paceSPerKm: activities.paceSPerKm,
      })
      .from(activities)
      .where(and(eq(activities.userId, userId), isNotNull(activities.distanceM)))
      .orderBy(desc(activities.distanceM))
      .limit(10),

    db
      .select({
        id: activities.id,
        name: activities.name,
        date: sql<string>`to_char(${activities.startDateLocal}, 'YYYY-MM-DD')`,
        elevationM: activities.elevationGainM,
        distanceM: activities.distanceM,
      })
      .from(activities)
      .where(and(eq(activities.userId, userId), isNotNull(activities.elevationGainM)))
      .orderBy(desc(activities.elevationGainM))
      .limit(10),

    db
      .select({
        weekStart: sql<string>`to_char(date_trunc('week', ${activities.startDateLocal}), 'YYYY-MM-DD')`,
        distance: sql<number>`coalesce(sum(${activities.distanceM}), 0)::float8`,
        runs: sql<number>`count(*)::int`,
      })
      .from(activities)
      .where(eq(activities.userId, userId))
      .groupBy(sql`1`)
      .orderBy(sql`2 desc`)
      .limit(10),

    db
      .select({
        month: sql<string>`to_char(date_trunc('month', ${activities.startDateLocal}), 'YYYY-MM')`,
        distance: sql<number>`coalesce(sum(${activities.distanceM}), 0)::float8`,
        runs: sql<number>`count(*)::int`,
      })
      .from(activities)
      .where(eq(activities.userId, userId))
      .groupBy(sql`1`)
      .orderBy(sql`2 desc`)
      .limit(10),

    db
      .select({
        id: activities.id,
        name: activities.name,
        date: sql<string>`to_char(${activities.startDateLocal}, 'YYYY-MM-DD')`,
        distanceM: activities.distanceM,
        movingTimeS: activities.movingTimeS,
        paceSPerKm: activities.paceSPerKm,
      })
      .from(activities)
      .where(and(eq(activities.userId, userId), eq(activities.isRace, true)))
      .orderBy(desc(activities.startDateLocal))
      .limit(20),
  ]);

  // Rank in memory rather than five separate jsonb min() queries.
  const personalRecordLists = rankPersonalRecords(efforts);
  const personalRecords = PR_DISTANCES.flatMap(
    (distance) => personalRecordLists[String(distance)]?.slice(0, 1) ?? [],
  );

  return {
    personalRecords,
    personalRecordLists,
    analyzed: counts[0]?.analyzed ?? 0,
    pendingAnalysis: counts[0]?.pending ?? 0,
    longestRuns: longest.map((row) => ({
      activityId: row.id,
      name: row.name,
      date: row.date,
      distanceM: row.distanceM ?? 0,
      movingTimeS: row.movingTimeS,
      paceSPerKm: row.paceSPerKm,
    })),
    mostElevation: elevation.map((row) => ({
      activityId: row.id,
      name: row.name,
      date: row.date,
      elevationM: row.elevationM ?? 0,
      distanceM: row.distanceM,
    })),
    biggestWeeks: weeks.map((row) => ({
      key: row.weekStart,
      distanceM: row.distance,
      runs: row.runs,
    })),
    biggestMonths: months.map((row) => ({
      key: row.month,
      distanceM: row.distance,
      runs: row.runs,
    })),
    races: races.map((race) => ({
      activityId: race.id,
      name: race.name,
      date: race.date,
      distanceM: race.distanceM,
      movingTimeS: race.movingTimeS,
      paceSPerKm: race.paceSPerKm,
    })),
  };
}
