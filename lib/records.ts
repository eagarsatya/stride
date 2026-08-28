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

/** Fastest time in seconds for each PR distance found in one activity. */
export type BestEfforts = Record<string, number>;

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
 * Fastest continuous effort over each PR distance, via a two-pointer sweep of
 * the cumulative distance stream.
 *
 * Both streams must be full resolution: running this on downsampled data would
 * quantise the window edges and report times that were never actually run.
 * Time is interpolated at the window boundary so a 5K PR is not rounded up to
 * the next GPS sample.
 */
export function computeBestEfforts(
  distanceSamples: unknown[] | undefined,
  timeSamples: unknown[] | undefined,
  distances: readonly number[] = PR_DISTANCES,
): BestEfforts {
  const distance = toNumberSeries(distanceSamples);
  const time = toNumberSeries(timeSamples);
  const result: BestEfforts = {};

  if (!distance || !time) return result;

  const n = Math.min(distance.length, time.length);
  if (n < 2) return result;

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

      const elapsed = segmentTime - trimmed;
      if (elapsed > 0 && elapsed < best) best = elapsed;
    }

    if (Number.isFinite(best)) {
      result[String(target)] = Math.round(best * 10) / 10;
    }
  }

  return result;
}
