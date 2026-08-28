export type Split = {
  /** 1-based split number. */
  index: number;
  /** Metres covered in this split; the last one is usually a partial. */
  distanceM: number;
  elapsedS: number;
  paceSPerKm: number | null;
  avgHr: number | null;
  elevationGainM: number | null;
};

const SPLIT_METRES = 1000;

function numeric(samples: unknown[] | undefined): number[] | null {
  if (!samples || samples.length === 0) return null;

  const out: number[] = new Array(samples.length);
  for (let i = 0; i < samples.length; i += 1) {
    const value = samples[i];
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    out[i] = value;
  }
  return out;
}

/**
 * Per-kilometre splits derived from the distance and time streams.
 *
 * Deliberately computed rather than read from the upstream lap data: COROS laps
 * depend on how the watch was configured (manual laps, custom autolap), so they
 * are not comparable across runs. Split boundaries are interpolated between
 * samples, and heart rate is averaged over the samples inside each split.
 */
export function computeSplits(
  distanceSamples: unknown[] | undefined,
  timeSamples: unknown[] | undefined,
  heartrateSamples?: unknown[] | undefined,
  splitMetres = SPLIT_METRES,
): Split[] {
  const distance = numeric(distanceSamples);
  const time = numeric(timeSamples);
  const heartrate = numeric(heartrateSamples);

  if (!distance || !time) return [];

  const n = Math.min(distance.length, time.length);
  if (n < 2) return [];

  const splits: Split[] = [];

  let boundaryDistance = distance[0];
  let boundaryTime = time[0];
  let hrSum = 0;
  let hrCount = 0;
  let index = 1;

  for (let i = 1; i < n; i += 1) {
    if (heartrate && i < heartrate.length) {
      hrSum += heartrate[i];
      hrCount += 1;
    }

    const target = boundaryDistance + splitMetres;
    if (distance[i] < target) continue;

    // Interpolate the exact moment the split boundary was crossed.
    const segment = distance[i] - distance[i - 1];
    const ratio = segment > 0 ? (target - distance[i - 1]) / segment : 0;
    const crossedAt = time[i - 1] + (time[i] - time[i - 1]) * ratio;

    const elapsedS = crossedAt - boundaryTime;

    splits.push({
      index,
      distanceM: splitMetres,
      elapsedS,
      paceSPerKm: elapsedS > 0 ? (elapsedS / splitMetres) * 1000 : null,
      avgHr: hrCount > 0 ? Math.round(hrSum / hrCount) : null,
      elevationGainM: null,
    });

    index += 1;
    boundaryDistance = target;
    boundaryTime = crossedAt;
    hrSum = 0;
    hrCount = 0;
  }

  // Trailing partial split, only worth showing if it is a meaningful distance.
  const remaining = distance[n - 1] - boundaryDistance;
  if (remaining >= splitMetres * 0.1) {
    const elapsedS = time[n - 1] - boundaryTime;
    splits.push({
      index,
      distanceM: remaining,
      elapsedS,
      paceSPerKm: elapsedS > 0 && remaining > 0 ? (elapsedS / remaining) * 1000 : null,
      avgHr: hrCount > 0 ? Math.round(hrSum / hrCount) : null,
      elevationGainM: null,
    });
  }

  return splits;
}

export type SeriesPoint = {
  distanceKm: number;
  paceSPerKm: number | null;
  heartrate: number | null;
  altitude: number | null;
};

/**
 * Build the distance-indexed series behind the pace/HR chart.
 *
 * Instantaneous pace from consecutive GPS samples is far too noisy to plot, so
 * pace is computed over a trailing window.
 */
export function buildSeries(
  streams: Record<string, unknown[]> | null,
  windowSamples = 15,
): SeriesPoint[] {
  if (!streams) return [];

  const distance = numeric(streams.distance);
  const time = numeric(streams.time);
  if (!distance || !time) return [];

  const heartrate = numeric(streams.heartrate);
  const altitude = numeric(streams.altitude);

  const n = Math.min(distance.length, time.length);
  const points: SeriesPoint[] = [];

  for (let i = 0; i < n; i += 1) {
    const back = Math.max(0, i - windowSamples);
    const deltaD = distance[i] - distance[back];
    const deltaT = time[i] - time[back];

    let pace: number | null = null;
    if (deltaD > 1 && deltaT > 0) {
      const candidate = (deltaT / deltaD) * 1000;
      // Drop stopped or nonsensical samples rather than spiking the chart.
      if (candidate > 100 && candidate < 1500) pace = candidate;
    }

    points.push({
      distanceKm: Number((distance[i] / 1000).toFixed(3)),
      paceSPerKm: pace,
      heartrate: heartrate && i < heartrate.length ? heartrate[i] : null,
      altitude: altitude && i < altitude.length ? altitude[i] : null,
    });
  }

  return points;
}

/** Extract a [lng, lat] route line for MapLibre from the latlng stream. */
export function toRouteLine(streams: Record<string, unknown[]> | null): [number, number][] {
  const raw = streams?.latlng;
  if (!Array.isArray(raw)) return [];

  const line: [number, number][] = [];

  for (const point of raw) {
    if (!Array.isArray(point) || point.length < 2) continue;

    const [lat, lng] = point as [unknown, unknown];
    if (typeof lat !== "number" || typeof lng !== "number") continue;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    // A 0,0 fix means the watch had no satellites yet.
    if (lat === 0 && lng === 0) continue;

    // GeoJSON is [longitude, latitude], the stream is [latitude, longitude].
    line.push([lng, lat]);
  }

  return line;
}

export function boundsOf(line: [number, number][]): [[number, number], [number, number]] | null {
  if (line.length === 0) return null;

  let minLng = line[0][0];
  let maxLng = line[0][0];
  let minLat = line[0][1];
  let maxLat = line[0][1];

  for (const [lng, lat] of line) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }

  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
}
