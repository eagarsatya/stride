/**
 * Personal-record distances in metres. Keys are stored as strings in the
 * `activities.bestEfforts` JSON column.
 */
export const PR_DISTANCES = [1000, 5000, 10_000, 21_097.5, 42_195] as const;

export type PrDistance = (typeof PR_DISTANCES)[number];

export const PR_LABELS: Record<string, string> = {
  "1000": "1K",
  "5000": "5K",
  "10000": "10K",
  "21097.5": "Half marathon",
  "42195": "Marathon",
};

/** Compact labels for tab triggers and tight table headings. */
export const PR_SHORT_LABELS: Record<string, string> = {
  "1000": "1K",
  "5000": "5K",
  "10000": "10K",
  "21097.5": "Half",
  "42195": "Marathon",
};

/** Fastest time in seconds for each PR distance found in one activity. */
export type BestEfforts = Record<string, number>;

export type PersonalRecord = {
  distanceM: number;
  timeS: number;
  activityId: string;
  activityName: string | null;
  date: string;
  isRace: boolean;
};

export type EffortRow = {
  id: string;
  name: string | null;
  date: string;
  isRace: boolean;
  bestEfforts: BestEfforts | null | undefined;
};

/**
 * Fastest `limit` efforts at each PR distance. Ties break toward the more
 * recent run so a matched time does not hide the latest attempt.
 */
export function rankPersonalRecords(
  rows: EffortRow[],
  limit = 10,
  distances: readonly number[] = PR_DISTANCES,
): Record<string, PersonalRecord[]> {
  const lists: Record<string, PersonalRecord[]> = {};

  for (const distance of distances) {
    const key = String(distance);
    const ranked: PersonalRecord[] = [];

    for (const row of rows) {
      const timeS = row.bestEfforts?.[key];
      if (typeof timeS !== "number" || !Number.isFinite(timeS) || timeS <= 0) continue;

      ranked.push({
        distanceM: distance,
        timeS,
        activityId: row.id,
        activityName: row.name,
        date: row.date,
        isRace: row.isRace,
      });
    }

    ranked.sort((a, b) => a.timeS - b.timeS || b.date.localeCompare(a.date));
    if (ranked.length > 0) lists[key] = ranked.slice(0, limit);
  }

  return lists;
}

function toNumberSeries(samples: unknown[] | undefined): number[] | null {
  if (!samples || samples.length === 0) return null;

  const series: number[] = new Array(samples.length);
  for (let i = 0; i < samples.length; i += 1) {
    const value = samples[i];
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    series[i] = value;
  }
  return series;
}

/**
 * Speeds below this (~1.8 km/h) are treated as stopped. Matches the usual
 * running auto-pause threshold, so a traffic-light wait is not part of a PR.
 */
const MIN_MOVING_SPEED_MS = 0.5;

/**
 * Best efforts computed before this used elapsed (wall-clock) stream time.
 * Cached analyses older than this are rebuilt as moving time.
 */
export const BEST_EFFORTS_MOVING_SINCE = new Date("2026-11-16T17:50:00.000Z");

/**
 * Convert an elapsed `time` stream into cumulative moving time by dropping
 * samples where the athlete was not covering ground.
 *
 * GPS `time` is seconds from the start of the activity, including pauses and
 * standing still. A watch pause shows up as a timestamp jump with almost no
 * distance; a traffic light with the watch still recording shows up as
 * repeated distance. Both are excluded so a 5K PR matches moving time.
 */
export function toMovingTime(distance: number[], elapsed: number[]): number[] {
  const n = Math.min(distance.length, elapsed.length);
  const moving = new Array<number>(n);
  if (n === 0) return moving;

  moving[0] = 0;
  let acc = 0;

  for (let i = 1; i < n; i += 1) {
    const dt = elapsed[i] - elapsed[i - 1];
    const dd = distance[i] - distance[i - 1];
    if (dt > 0 && dd > 0 && dd / dt >= MIN_MOVING_SPEED_MS) acc += dt;
    moving[i] = acc;
  }

  return moving;
}

/**
 * Fastest continuous effort over each PR distance, via a two-pointer sweep of
 * the cumulative distance stream.
 *
 * Both streams must be full resolution: running this on downsampled data would
 * quantise the window edges and report times that were never actually run.
 * Time is interpolated at the window boundary so a 5K PR is not rounded up to
 * the next GPS sample. Reported times are moving time: stops and watch pauses
 * inside the window are not counted.
 */
export function computeBestEfforts(
  distanceSamples: unknown[] | undefined,
  timeSamples: unknown[] | undefined,
  distances: readonly number[] = PR_DISTANCES,
): BestEfforts {
  const distance = toNumberSeries(distanceSamples);
  const elapsed = toNumberSeries(timeSamples);
  const result: BestEfforts = {};

  if (!distance || !elapsed) return result;

  const n = Math.min(distance.length, elapsed.length);
  if (n < 2) return result;

  const time = toMovingTime(distance, elapsed);
  const total = distance[n - 1] - distance[0];

  for (const target of distances) {
    if (total < target) continue;

    let best = Infinity;
    let start = 0;

    for (let end = 1; end < n; end += 1) {
      // Advance `start` while the window is still at least `target` long, so it
      // ends up as the tightest window that still covers the distance.
      while (start + 1 < end && distance[end] - distance[start + 1] >= target) {
        start += 1;
      }

      const segment = distance[end] - distance[start];
      if (segment < target) continue;

      const segmentTime = time[end] - time[start];

      // The loop above guarantees the overshoot is smaller than the first
      // sub-segment, so trim it from there rather than smearing it across the
      // whole window -- otherwise a fast finish would inflate the result.
      const overshoot = segment - target;
      const leadDistance = distance[start + 1] - distance[start];
      const leadTime = time[start + 1] - time[start];
      const trimmed =
        leadDistance > 0 ? (leadTime * Math.min(overshoot, leadDistance)) / leadDistance : 0;

      const moving = segmentTime - trimmed;
      if (moving > 0 && moving < best) best = moving;
    }

    if (Number.isFinite(best)) {
      result[String(target)] = Math.round(best * 10) / 10;
    }
  }

  return result;
}
