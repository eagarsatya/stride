import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

export const syncKind = pgEnum("sync_kind", ["backfill", "incremental", "manual"]);
export const syncStatus = pgEnum("sync_status", ["queued", "running", "success", "error"]);

/**
 * A user's link to an upstream training platform.
 *
 * Holds either an encrypted personal API key (phase 1) or an OAuth token pair
 * (phase 2). `lib/intervals/auth.ts` picks whichever is present, so the rest of
 * the app never needs to know which credential type is in use.
 */
export const connections = pgTable(
  "connections",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    provider: text().notNull().default("intervals_icu"),

    icuAthleteId: text().notNull(),
    icuAthleteName: text(),

    // Phase 1: AES-256-GCM encrypted personal API key.
    apiKeyCipher: text(),
    apiKeyIv: text(),
    apiKeyTag: text(),

    // Phase 2: OAuth, stored on the same row.
    accessToken: text(),
    refreshToken: text(),
    tokenExpiresAt: timestamp({ withTimezone: true }),
    scopes: text(),

    lastSyncAt: timestamp({ withTimezone: true }),
    lastSyncStatus: syncStatus(),
    lastSyncError: text(),
    /** Oldest date we have successfully pulled, so backfill can resume. */
    oldestSyncedDate: date(),

    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [unique("connections_user_provider_unique").on(t.userId, t.provider)],
);

/**
 * One synced run. Typed columns cover everything the dashboard queries; `raw`
 * keeps the untouched upstream payload so new charts never need a re-sync.
 */
export const activities = pgTable(
  "activities",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    icuActivityId: text().notNull(),
    /** Upstream provenance, e.g. "COROS" or "UPLOAD". */
    source: text(),
    externalId: text(),

    name: text(),
    type: text().notNull(),
    subType: text(),

    /** Wall-clock start in the activity's own timezone. */
    startDateLocal: timestamp({ withTimezone: false }).notNull(),
    startDate: timestamp({ withTimezone: true }),
    timezone: text(),

    distanceM: doublePrecision(),
    movingTimeS: integer(),
    elapsedTimeS: integer(),
    elevationGainM: doublePrecision(),
    elevationLossM: doublePrecision(),

    avgSpeedMs: doublePrecision(),
    maxSpeedMs: doublePrecision(),
    /** Derived from avgSpeedMs for cheap sorting and charting. */
    paceSPerKm: doublePrecision(),
    /** Grade-adjusted pace, derived from the upstream `gap` speed. */
    gapSPerKm: doublePrecision(),

    avgHr: integer(),
    maxHr: integer(),
    avgCadence: doublePrecision(),
    calories: integer(),

    trainingLoad: doublePrecision(),
    atl: doublePrecision(),
    ctl: doublePrecision(),
    intensity: doublePrecision(),
    efficiencyFactor: doublePrecision(),
    decoupling: doublePrecision(),
    avgStrideM: doublePrecision(),
    trimp: doublePrecision(),

    /** Seconds spent in each zone, index 0 = zone 1. */
    hrZoneTimes: jsonb().$type<number[]>(),
    paceZoneTimes: jsonb().$type<number[]>(),

    isRace: boolean().default(false).notNull(),
    isTreadmill: boolean().default(false).notNull(),
    feel: integer(),
    rpe: integer(),
    deviceName: text(),

    /** Stream channels the upstream activity has, e.g. ["latlng","heartrate"]. */
    streamTypes: jsonb().$type<string[]>(),
    hasGps: boolean().default(false).notNull(),

    raw: jsonb().notNull(),
    syncedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique("activities_user_icu_activity_unique").on(t.userId, t.icuActivityId),
    index("activities_user_start_idx").on(t.userId, t.startDateLocal),
    index("activities_user_type_idx").on(t.userId, t.type),
  ],
);

/**
 * Per-activity time series, fetched only when an activity detail page is
 * opened. Streams are downsampled on ingest (see STREAM_MAX_POINTS) because the
 * charts and route map cannot resolve more detail than that anyway.
 */
export const activityStreams = pgTable("activity_streams", {
  activityId: uuid()
    .primaryKey()
    .references(() => activities.id, { onDelete: "cascade" }),
  /** Map of stream name to downsampled sample array. */
  data: jsonb().$type<Record<string, unknown[]>>().notNull(),
  pointCount: integer().notNull(),
  fetchedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
});

/** Daily wellness rows, used for the fitness/fatigue/form chart. */
export const wellness = pgTable(
  "wellness",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    date: date().notNull(),

    weightKg: doublePrecision(),
    restingHr: integer(),
    hrv: doublePrecision(),
    sleepSecs: integer(),
    sleepScore: integer(),
    steps: integer(),

    ctl: doublePrecision(),
    atl: doublePrecision(),

    raw: jsonb(),
    syncedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique("wellness_user_date_unique").on(t.userId, t.date),
    index("wellness_user_date_idx").on(t.userId, t.date),
  ],
);

/** Sync run history, so the UI can show progress and surface failures. */
export const syncJobs = pgTable(
  "sync_jobs",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: syncKind().notNull(),
    status: syncStatus().notNull().default("queued"),

    windowsTotal: integer().default(0).notNull(),
    windowsDone: integer().default(0).notNull(),
    activitiesUpserted: integer().default(0).notNull(),
    wellnessUpserted: integer().default(0).notNull(),
    error: text(),

    startedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp({ withTimezone: true }),
  },
  (t) => [index("sync_jobs_user_started_idx").on(t.userId, t.startedAt)],
);

export type Connection = typeof connections.$inferSelect;
export type Activity = typeof activities.$inferSelect;
export type NewActivity = typeof activities.$inferInsert;
export type ActivityStream = typeof activityStreams.$inferSelect;
export type Wellness = typeof wellness.$inferSelect;
export type SyncJob = typeof syncJobs.$inferSelect;
