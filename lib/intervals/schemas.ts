import { z } from "zod";

/**
 * Intervals.icu returns a very wide, loosely documented payload and adds fields
 * over time. Optional fields therefore use `.catch(null)`: a single unexpected
 * type degrades that one field to null instead of dropping a whole activity.
 * Fields we genuinely cannot work without stay strict.
 */
const num = () => z.number().nullish().catch(null);
const str = () => z.string().nullish().catch(null);
const bool = () => z.boolean().nullish().catch(null);
const numArray = () => z.array(z.number()).nullish().catch(null);
const strArray = () => z.array(z.string()).nullish().catch(null);

/** Activity and athlete ids come back as strings, but tolerate numbers. */
const idLike = z.union([z.string(), z.number()]).transform(String);

export const RUN_TYPES = ["Run", "TrailRun", "VirtualRun"] as const;

export function isRunType(type: string | null | undefined): boolean {
  return !!type && (RUN_TYPES as readonly string[]).includes(type);
}

/**
 * `/athlete/{id}/profile` returns `{ athlete, sharedFolders, customItems }`, so
 * the athlete is nested. A top-level `id` is also accepted because the plain
 * `/athlete/{id}` endpoint returns the athlete flat.
 */
export const athleteSchema = z.looseObject({
  id: idLike.nullish().catch(null),
  name: str(),
  email: str(),
  timezone: str(),
  sex: str(),
});

export const profileSchema = z.looseObject({
  id: idLike.nullish().catch(null),
  name: str(),
  athlete: athleteSchema.nullish().catch(null),
});

export type IntervalsProfile = z.infer<typeof profileSchema>;

export function resolveAthlete(profile: IntervalsProfile): {
  id: string;
  name: string | null;
} | null {
  const id = profile.athlete?.id ?? profile.id;
  if (!id) return null;
  return { id, name: profile.athlete?.name ?? profile.name ?? null };
}

export const activitySchema = z.looseObject({
  id: idLike,
  /** Local wall-clock start, e.g. "2026-05-01T06:12:00". */
  start_date_local: z.string(),

  name: str(),
  description: str(),
  type: str(),
  sub_type: str(),
  start_date: str(),
  timezone: str(),

  distance: num(),
  icu_distance: num(),
  moving_time: num(),
  elapsed_time: num(),
  total_elevation_gain: num(),
  total_elevation_loss: num(),

  average_speed: num(),
  max_speed: num(),
  /** Speed in m/s despite the name. */
  pace: num(),
  /** Grade-adjusted speed in m/s. */
  gap: num(),

  average_heartrate: num(),
  max_heartrate: num(),
  average_cadence: num(),
  calories: num(),

  icu_training_load: num(),
  icu_atl: num(),
  icu_ctl: num(),
  icu_intensity: num(),
  icu_efficiency_factor: num(),
  decoupling: num(),
  average_stride: num(),
  trimp: num(),

  icu_hr_zone_times: numArray(),
  pace_zone_times: numArray(),

  race: bool(),
  trainer: bool(),
  feel: num(),
  icu_rpe: num(),
  perceived_exertion: num(),

  device_name: str(),
  external_id: str(),
  source: str(),
  stream_types: strArray(),
  icu_lap_count: num(),
});

export type IntervalsActivity = z.infer<typeof activitySchema>;

export const activityListSchema = z.array(z.unknown());

/** A lap or interval inside an activity, used for the training-set table. */
export const intervalSchema = z.looseObject({
  id: num(),
  label: str(),
  type: str(),
  group_id: num(),
  distance: num(),
  moving_time: num(),
  elapsed_time: num(),
  average_speed: num(),
  average_pace: num(),
  gap: num(),
  average_heartrate: num(),
  max_heartrate: num(),
  average_cadence: num(),
  total_elevation_gain: num(),
  start_index: num(),
  end_index: num(),
});

export type IntervalsInterval = z.infer<typeof intervalSchema>;

export const intervalGroupSchema = z.looseObject({
  id: num(),
  label: str(),
  color: str(),
});

export type IntervalsIntervalGroup = z.infer<typeof intervalGroupSchema>;

export const intervalsDtoSchema = z.looseObject({
  icu_intervals: z.array(intervalSchema).nullish().catch(null),
  icu_groups: z.array(intervalGroupSchema).nullish().catch(null),
});

export type IntervalsDto = z.infer<typeof intervalsDtoSchema>;

export const activityDetailSchema = activitySchema.extend({
  icu_intervals: z.array(intervalSchema).nullish().catch(null),
  icu_groups: z.array(intervalGroupSchema).nullish().catch(null),
});

export type IntervalsActivityDetail = z.infer<typeof activityDetailSchema>;

/**
 * `/activity/{id}/streams.json` returns an array of channels. `data` is typed
 * loosely because latlng holds `[lat, lng]` pairs while other channels hold
 * plain numbers, and a channel the device never recorded comes back null with
 * `allNull` set.
 */
export const streamSchema = z.looseObject({
  type: z.string(),
  name: str(),
  data: z.array(z.unknown()).nullish().catch(null),
  valueTypeIsArray: bool(),
  allNull: bool(),
});

export const streamListSchema = z.array(streamSchema);

export type IntervalsStream = z.infer<typeof streamSchema>;

/** Channels with no samples are useless downstream, so drop them early. */
export function usableStreams(
  streams: IntervalsStream[],
): Array<{ type: string; data: unknown[] }> {
  return streams
    .filter((stream) => !stream.allNull && stream.data && stream.data.length > 0)
    .map((stream) => ({ type: stream.type, data: stream.data as unknown[] }));
}

/**
 * Daily wellness. The date arrives as `id` (an ISO date string) and field names
 * are camelCase here, unlike the snake_case activity payload.
 */
export const wellnessSchema = z.looseObject({
  id: z.string(),
  ctl: num(),
  atl: num(),
  weight: num(),
  restingHR: num(),
  hrv: num(),
  sleepSecs: num(),
  sleepScore: num(),
  steps: num(),
});

export type IntervalsWellness = z.infer<typeof wellnessSchema>;

export const wellnessListSchema = z.array(z.unknown());
