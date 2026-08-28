import type { NewActivity } from "@/db/schema/app";

import type { IntervalsActivity, IntervalsWellness } from "./schemas";

/**
 * Streams are stored downsampled: neither the charts (a few hundred pixels
 * wide) nor the route polyline can resolve more than this, and full-resolution
 * samples would bloat every row for no visible gain.
 */
export const STREAM_MAX_POINTS = 1000;

function toFinite(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toInt(value: number | null | undefined): number | null {
  const n = toFinite(value);
  return n === null ? null : Math.round(n);
}

/** Convert a speed in m/s to seconds per kilometre. */
export function speedToPace(speedMs: number | null | undefined): number | null {
  const speed = toFinite(speedMs);
  if (speed === null || speed <= 0) return null;

  const pace = 1000 / speed;
  // Anything slower than ~50 min/km is a stopped or corrupt sample.
  return pace > 3000 ? null : pace;
}

/** Trim a trailing "Z"-less local timestamp to what Postgres expects. */
function normalizeLocalStart(value: string): string {
  return value.replace(/(?:Z|[+-]\d{2}:?\d{2})$/, "").slice(0, 19);
}

function parseUtc(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function mapActivity(userId: string, activity: IntervalsActivity): NewActivity {
  const streamTypes = activity.stream_types ?? null;
  const avgSpeed = toFinite(activity.average_speed);

  return {
    userId,
    icuActivityId: activity.id,
    source: activity.source ?? null,
    externalId: activity.external_id ?? null,

    name: activity.name ?? null,
    // The list endpoint is already filtered to run types by the caller.
    type: activity.type ?? "Run",
    subType: activity.sub_type ?? null,

    startDateLocal: normalizeLocalStart(activity.start_date_local),
    startDate: parseUtc(activity.start_date),
    timezone: activity.timezone ?? null,

    distanceM: toFinite(activity.distance) ?? toFinite(activity.icu_distance),
    movingTimeS: toInt(activity.moving_time),
    elapsedTimeS: toInt(activity.elapsed_time),
    elevationGainM: toFinite(activity.total_elevation_gain),
    elevationLossM: toFinite(activity.total_elevation_loss),

    avgSpeedMs: avgSpeed,
    maxSpeedMs: toFinite(activity.max_speed),
    paceSPerKm: speedToPace(avgSpeed),
    gapSPerKm: speedToPace(activity.gap),

    avgHr: toInt(activity.average_heartrate),
    maxHr: toInt(activity.max_heartrate),
    avgCadence: toFinite(activity.average_cadence),
    calories: toInt(activity.calories),

    trainingLoad: toFinite(activity.icu_training_load),
    atl: toFinite(activity.icu_atl),
    ctl: toFinite(activity.icu_ctl),
    intensity: toFinite(activity.icu_intensity),
    efficiencyFactor: toFinite(activity.icu_efficiency_factor),
    decoupling: toFinite(activity.decoupling),
    avgStrideM: toFinite(activity.average_stride),
    trimp: toFinite(activity.trimp),

    hrZoneTimes: activity.icu_hr_zone_times ?? null,
    paceZoneTimes: activity.pace_zone_times ?? null,

    isRace: activity.race === true,
    isTreadmill: activity.trainer === true,
    feel: toInt(activity.feel),
    rpe: toInt(activity.icu_rpe ?? activity.perceived_exertion),
    deviceName: activity.device_name ?? null,

    streamTypes,
    hasGps: streamTypes?.includes("latlng") ?? false,

    raw: activity,
  };
}

/**
 * Keep every nth sample, always preserving the first and last so charts and
 * route lines still start and end in the right place.
 */
export function downsample<T>(samples: T[], maxPoints = STREAM_MAX_POINTS): T[] {
  if (samples.length <= maxPoints) return samples;

  const stride = Math.ceil(samples.length / maxPoints);
  const result: T[] = [];
  for (let i = 0; i < samples.length; i += stride) result.push(samples[i]);

  const last = samples[samples.length - 1];
  if (result[result.length - 1] !== last) result.push(last);

  return result;
}

export function mapStreams(streams: Array<{ type: string; data: unknown[] }>): {
  data: Record<string, unknown[]>;
  pointCount: number;
} {
  const data: Record<string, unknown[]> = {};
  let pointCount = 0;

  for (const stream of streams) {
    const reduced = downsample(stream.data);
    data[stream.type] = reduced;
    pointCount = Math.max(pointCount, reduced.length);
  }

  return { data, pointCount };
}

export function mapWellness(userId: string, entry: IntervalsWellness) {
  return {
    userId,
    // The wellness endpoint returns the date in `id`.
    date: entry.id.slice(0, 10),
    weightKg: toFinite(entry.weight),
    restingHr: toInt(entry.restingHR),
    hrv: toFinite(entry.hrv),
    sleepSecs: toInt(entry.sleepSecs),
    sleepScore: toInt(entry.sleepScore),
    steps: toInt(entry.steps),
    ctl: toFinite(entry.ctl),
    atl: toFinite(entry.atl),
    raw: entry,
  };
}
