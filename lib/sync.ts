import { addDays, differenceInCalendarDays, subDays, subMonths, subYears } from "date-fns";
import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  activities,
  activityStreams,
  connections,
  syncJobs,
  wellness,
  type NewActivity,
} from "@/db/schema/app";
import { clientForConnection, getConnection } from "@/lib/connections";
import { isFitUploadId } from "@/lib/fit/match";
import { FIT_SOURCE } from "@/lib/fit/parse";
import { toApiDate, type IntervalsClient } from "@/lib/intervals/client";
import { mapActivity, mapStreams, mapWellness } from "@/lib/intervals/map";
import { isRunType, usableStreams } from "@/lib/intervals/schemas";
import { computeBestEfforts } from "@/lib/records";

export const BACKFILL_YEARS = 3;
const WINDOW_MONTHS = 6;
/** Re-check recent days so retroactive edits and late syncs are picked up. */
export const INCREMENTAL_OVERLAP_DAYS = 7;
const INITIAL_SYNC_DAYS = 90;
/** Neon's HTTP driver sends one statement per round trip, so keep rows modest. */
const UPSERT_CHUNK = 25;
const WELLNESS_CHUNK = 200;
/** A job still "running" after this long is assumed dead (function timed out). */
const STALE_JOB_MINUTES = 15;
const MANUAL_SYNC_COOLDOWN_MS = 60_000;

export type SyncKind = "backfill" | "incremental" | "manual";

export type SyncOutcome = {
  jobId: string;
  activitiesUpserted: number;
  wellnessUpserted: number;
  skipped: number;
  windows: number;
  oldestActivityDate: string | null;
};

export class SyncBusyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SyncBusyError";
  }
}

export class NotConnectedError extends Error {
  constructor() {
    super("No Intervals.icu connection for this account.");
    this.name = "NotConnectedError";
  }
}

type DateRange = { oldest: Date; newest: Date };

/**
 * Split a range into windows, newest first, so the most recent runs land in the
 * database before the long tail of history.
 */
export function buildWindows(range: DateRange, months = WINDOW_MONTHS): DateRange[] {
  const windows: DateRange[] = [];
  let newest = range.newest;

  while (newest > range.oldest) {
    const oldest = subMonths(newest, months);
    windows.push({
      oldest: oldest < range.oldest ? range.oldest : oldest,
      newest,
    });
    newest = subDays(oldest, 1);
  }

  return windows.length > 0 ? windows : [range];
}

function rangeForKind(kind: SyncKind, connection: { lastSyncAt: Date | null }): DateRange {
  const newest = addDays(new Date(), 1);

  if (kind === "backfill") {
    return { oldest: subYears(new Date(), BACKFILL_YEARS), newest };
  }

  if (!connection.lastSyncAt) {
    return { oldest: subDays(new Date(), INITIAL_SYNC_DAYS), newest };
  }

  return { oldest: subDays(connection.lastSyncAt, INCREMENTAL_OVERLAP_DAYS), newest };
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

/**
 * Upsert on (userId, icuActivityId). `bestEfforts` is deliberately absent from
 * the update set: it is derived from streams by a separate pass and must
 * survive a re-sync of the same activity.
 */
async function upsertActivities(rows: NewActivity[]): Promise<number> {
  let count = 0;

  for (const batch of chunk(rows, UPSERT_CHUNK)) {
    await db
      .insert(activities)
      .values(batch)
      .onConflictDoUpdate({
        target: [activities.userId, activities.icuActivityId],
        set: {
          source: sql`excluded.source`,
          externalId: sql`excluded.external_id`,
          name: sql`excluded.name`,
          type: sql`excluded.type`,
          subType: sql`excluded.sub_type`,
          startDateLocal: sql`excluded.start_date_local`,
          startDate: sql`excluded.start_date`,
          timezone: sql`excluded.timezone`,
          distanceM: sql`excluded.distance_m`,
          movingTimeS: sql`excluded.moving_time_s`,
          elapsedTimeS: sql`excluded.elapsed_time_s`,
          elevationGainM: sql`excluded.elevation_gain_m`,
          elevationLossM: sql`excluded.elevation_loss_m`,
          avgSpeedMs: sql`excluded.avg_speed_ms`,
          maxSpeedMs: sql`excluded.max_speed_ms`,
          paceSPerKm: sql`excluded.pace_s_per_km`,
          gapSPerKm: sql`excluded.gap_s_per_km`,
          avgHr: sql`excluded.avg_hr`,
          maxHr: sql`excluded.max_hr`,
          avgCadence: sql`excluded.avg_cadence`,
          calories: sql`excluded.calories`,
          trainingLoad: sql`excluded.training_load`,
          atl: sql`excluded.atl`,
          ctl: sql`excluded.ctl`,
          intensity: sql`excluded.intensity`,
          efficiencyFactor: sql`excluded.efficiency_factor`,
          decoupling: sql`excluded.decoupling`,
          avgStrideM: sql`excluded.avg_stride_m`,
          trimp: sql`excluded.trimp`,
          hrZoneTimes: sql`excluded.hr_zone_times`,
          paceZoneTimes: sql`excluded.pace_zone_times`,
          isRace: sql`excluded.is_race`,
          isTreadmill: sql`excluded.is_treadmill`,
          feel: sql`excluded.feel`,
          rpe: sql`excluded.rpe`,
          deviceName: sql`excluded.device_name`,
          streamTypes: sql`excluded.stream_types`,
          hasGps: sql`excluded.has_gps`,
          raw: sql`excluded.raw`,
          syncedAt: new Date(),
        },
      });

    count += batch.length;
  }

  return count;
}

async function syncWellnessRange(
  client: IntervalsClient,
  userId: string,
  range: DateRange,
): Promise<number> {
  const { items } = await client.listWellness(range);
  if (items.length === 0) return 0;

  const rows = items.map((entry) => mapWellness(userId, entry));
  let count = 0;

  for (const batch of chunk(rows, WELLNESS_CHUNK)) {
    await db
      .insert(wellness)
      .values(batch)
      .onConflictDoUpdate({
        target: [wellness.userId, wellness.date],
        set: {
          weightKg: sql`excluded.weight_kg`,
          restingHr: sql`excluded.resting_hr`,
          hrv: sql`excluded.hrv`,
          sleepSecs: sql`excluded.sleep_secs`,
          sleepScore: sql`excluded.sleep_score`,
          steps: sql`excluded.steps`,
          ctl: sql`excluded.ctl`,
          atl: sql`excluded.atl`,
          raw: sql`excluded.raw`,
          syncedAt: new Date(),
        },
      });
    count += batch.length;
  }

  return count;
}

/** Reject a second concurrent sync, and rate-limit user-triggered ones. */
async function assertCanSync(userId: string, kind: SyncKind): Promise<void> {
  const [latest] = await db
    .select()
    .from(syncJobs)
    .where(eq(syncJobs.userId, userId))
    .orderBy(desc(syncJobs.startedAt))
    .limit(1);

  if (!latest) return;

  const ageMs = Date.now() - latest.startedAt.getTime();

  if (latest.status === "running" && ageMs < STALE_JOB_MINUTES * 60_000) {
    throw new SyncBusyError("A sync is already running. Give it a moment.");
  }

  if (kind === "manual" && latest.status === "success" && ageMs < MANUAL_SYNC_COOLDOWN_MS) {
    const seconds = Math.ceil((MANUAL_SYNC_COOLDOWN_MS - ageMs) / 1000);
    throw new SyncBusyError(`Just synced. Try again in ${seconds}s.`);
  }
}

export async function runSync(options: {
  userId: string;
  kind: SyncKind;
  range?: DateRange;
}): Promise<SyncOutcome> {
  const { userId, kind } = options;

  const connection = await getConnection(userId);
  if (!connection) throw new NotConnectedError();

  await assertCanSync(userId, kind);

  const client = clientForConnection(connection);
  const range = options.range ?? rangeForKind(kind, connection);
  const windows = buildWindows(range);

  const [job] = await db
    .insert(syncJobs)
    .values({
      userId,
      kind,
      status: "running",
      windowsTotal: windows.length,
    })
    .returning({ id: syncJobs.id });

  let activitiesUpserted = 0;
  let wellnessUpserted = 0;
  let skipped = 0;
  let oldestActivityDate: string | null = null;

  try {
    for (const [index, window] of windows.entries()) {
      const { items, skipped: unparsed } = await client.listActivities(window);
      skipped += unparsed;

      const runs = items.filter((activity) => isRunType(activity.type));

      if (runs.length > 0) {
        activitiesUpserted += await upsertActivities(
          runs.map((activity) => mapActivity(userId, activity)),
        );

        // The list comes back newest-first, so the last row is the oldest.
        const oldest = runs[runs.length - 1].start_date_local.slice(0, 10);
        if (!oldestActivityDate || oldest < oldestActivityDate) oldestActivityDate = oldest;
      }

      await db
        .update(syncJobs)
        .set({ windowsDone: index + 1, activitiesUpserted })
        .where(eq(syncJobs.id, job.id));
    }

    // Wellness is one row per day, so a year at a time keeps responses small.
    const wellnessWindows = buildWindows(range, 12);
    for (const window of wellnessWindows) {
      wellnessUpserted += await syncWellnessRange(client, userId, window);
    }

    await db
      .update(syncJobs)
      .set({
        status: "success",
        finishedAt: new Date(),
        activitiesUpserted,
        wellnessUpserted,
      })
      .where(eq(syncJobs.id, job.id));

    await db
      .update(connections)
      .set({
        lastSyncAt: new Date(),
        lastSyncStatus: "success",
        lastSyncError: null,
        updatedAt: new Date(),
        ...(kind === "backfill" && oldestActivityDate
          ? { oldestSyncedDate: toApiDate(range.oldest) }
          : {}),
      })
      .where(eq(connections.id, connection.id));

    return {
      jobId: job.id,
      activitiesUpserted,
      wellnessUpserted,
      skipped,
      windows: windows.length,
      oldestActivityDate,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown sync error";

    await db
      .update(syncJobs)
      .set({
        status: "error",
        finishedAt: new Date(),
        error: message.slice(0, 1000),
        activitiesUpserted,
      })
      .where(eq(syncJobs.id, job.id));

    await db
      .update(connections)
      .set({
        lastSyncStatus: "error",
        lastSyncError: message.slice(0, 1000),
        updatedAt: new Date(),
      })
      .where(eq(connections.id, connection.id));

    throw error;
  }
}

/**
 * Fetch and cache an activity's streams, computing best efforts from the
 * full-resolution samples before downsampling for storage.
 */
export async function ensureStreams(
  userId: string,
  activityId: string,
): Promise<Record<string, unknown[]> | null> {
  const [activity] = await db
    .select({
      id: activities.id,
      icuActivityId: activities.icuActivityId,
      source: activities.source,
      bestEffortsAt: activities.bestEffortsAt,
    })
    .from(activities)
    .where(and(eq(activities.id, activityId), eq(activities.userId, userId)))
    .limit(1);

  if (!activity) return null;

  const [cached] = await db
    .select({ data: activityStreams.data })
    .from(activityStreams)
    .where(eq(activityStreams.activityId, activity.id))
    .limit(1);

  if (cached) {
    // Streams cached before best efforts existed: derive them from the stored
    // (downsampled) samples rather than spending another API request. Marking
    // the row either way is what stops `analyzeBestEfforts` from looping.
    if (!activity.bestEffortsAt) {
      await markAnalyzed(activity.id, computeBestEfforts(cached.data.distance, cached.data.time));
    }
    return cached.data;
  }

  // Uploaded FIT files never exist on Intervals.icu; streams are written at import.
  if (activity.source === FIT_SOURCE || isFitUploadId(activity.icuActivityId)) {
    if (!activity.bestEffortsAt) await markAnalyzed(activity.id, {});
    return null;
  }

  const connection = await getConnection(userId);
  if (!connection) throw new NotConnectedError();

  const client = clientForConnection(connection);
  const streams = usableStreams(await client.getStreams(activity.icuActivityId));

  if (streams.length === 0) {
    // Treadmill runs and manual entries have no streams at all. Record the
    // attempt so this activity is not retried forever.
    await markAnalyzed(activity.id, {});
    return null;
  }

  const byType = new Map(streams.map((stream) => [stream.type, stream.data]));
  // Computed before downsampling: quantised split boundaries would report times
  // that were never actually run.
  const bestEfforts = computeBestEfforts(byType.get("distance"), byType.get("time"));

  const { data, pointCount } = mapStreams(streams);

  await db
    .insert(activityStreams)
    .values({ activityId: activity.id, data, pointCount })
    .onConflictDoUpdate({
      target: activityStreams.activityId,
      set: { data, pointCount, fetchedAt: new Date() },
    });

  await markAnalyzed(activity.id, bestEfforts);

  return data;
}

async function markAnalyzed(activityId: string, bestEfforts: Record<string, number>) {
  await db
    .update(activities)
    .set({ bestEfforts, bestEffortsAt: new Date() })
    .where(eq(activities.id, activityId));
}

/**
 * Analyze runs that have no best-effort data yet. Bounded per call so it fits
 * inside a serverless invocation; the caller re-runs until `remaining` is zero.
 */
export async function analyzeBestEfforts(
  userId: string,
  limit = 25,
): Promise<{ analyzed: number; remaining: number }> {
  const batch = await db
    .select({ id: activities.id })
    .from(activities)
    .where(
      and(
        eq(activities.userId, userId),
        sql`${activities.bestEffortsAt} is null`,
        sql`${activities.distanceM} >= 1000`,
      ),
    )
    .orderBy(desc(activities.startDateLocal))
    .limit(limit);

  let analyzed = 0;

  for (const activity of batch) {
    try {
      await ensureStreams(userId, activity.id);
      analyzed += 1;
    } catch {
      // Mark it attempted so one broken activity cannot stall the queue.
      await markAnalyzed(activity.id, {});
    }
  }

  const [{ count } = { count: 0 }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(activities)
    .where(
      and(
        eq(activities.userId, userId),
        sql`${activities.bestEffortsAt} is null`,
        sql`${activities.distanceM} >= 1000`,
      ),
    );

  return { analyzed, remaining: count };
}

export function daysSince(date: Date | null): number | null {
  return date ? differenceInCalendarDays(new Date(), date) : null;
}
