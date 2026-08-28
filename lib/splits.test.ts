import { describe, expect, it } from "vitest";

import { boundsOf, buildSeries, computeSplits, toRouteLine } from "./splits";

/** Constant-pace run sampled at 1 Hz. */
function steady(metres: number, paceSPerKm: number, hr?: number) {
  const speed = 1000 / paceSPerKm;
  const seconds = Math.round(metres / speed);

  const time: number[] = [];
  const distance: number[] = [];
  const heartrate: number[] = [];

  for (let t = 0; t <= seconds; t += 1) {
    time.push(t);
    distance.push(Math.min(t * speed, metres));
    if (hr !== undefined) heartrate.push(hr);
  }

  return { time, distance, heartrate };
}

describe("computeSplits", () => {
  it("produces one split per kilometre", () => {
    const { time, distance } = steady(5000, 300);
    const splits = computeSplits(distance, time);

    expect(splits).toHaveLength(5);
    expect(splits[0].index).toBe(1);
    expect(splits[0].distanceM).toBe(1000);
    expect(splits[0].paceSPerKm).toBeCloseTo(300, 0);
  });

  it("includes a trailing partial split", () => {
    const { time, distance } = steady(5400, 300);
    const splits = computeSplits(distance, time);

    expect(splits).toHaveLength(6);
    expect(splits[5].distanceM).toBeCloseTo(400, 0);
    expect(splits[5].paceSPerKm).toBeCloseTo(300, 0);
  });

  it("discards a negligible trailing fragment", () => {
    // 20 m past 5 km is GPS drift at the finish, not a split worth showing.
    const { time, distance } = steady(5020, 300);
    expect(computeSplits(distance, time)).toHaveLength(5);
  });

  it("averages heart rate within each split", () => {
    const { time, distance } = steady(2000, 300);
    // First half at 140 bpm, second half at 170 bpm.
    const heartrate = distance.map((d) => (d < 1000 ? 140 : 170));

    const splits = computeSplits(distance, time, heartrate);
    expect(splits[0].avgHr).toBeGreaterThanOrEqual(140);
    expect(splits[0].avgHr).toBeLessThan(150);
    expect(splits[1].avgHr).toBeGreaterThan(160);
  });

  it("reflects a pace change between splits", () => {
    const time: number[] = [0];
    const distance: number[] = [0];

    function leg(metres: number, paceSPerKm: number) {
      const speed = 1000 / paceSPerKm;
      const seconds = Math.round(metres / speed);
      const d0 = distance[distance.length - 1];
      const t0 = time[time.length - 1];
      for (let t = 1; t <= seconds; t += 1) {
        time.push(t0 + t);
        distance.push(d0 + t * speed);
      }
    }

    leg(1000, 360);
    leg(1000, 240);

    const splits = computeSplits(distance, time);
    expect(splits[0].paceSPerKm).toBeCloseTo(360, 0);
    expect(splits[1].paceSPerKm).toBeCloseTo(240, 0);
  });

  it("returns nothing without usable streams", () => {
    expect(computeSplits(undefined, undefined)).toEqual([]);
    expect(computeSplits([0], [0])).toEqual([]);
    expect(computeSplits(["a" as unknown], [0, 1])).toEqual([]);
  });

  it("supports a custom split distance", () => {
    const { time, distance } = steady(2000, 300);
    expect(computeSplits(distance, time, undefined, 500)).toHaveLength(4);
  });
});

describe("buildSeries", () => {
  it("smooths pace over a trailing window", () => {
    const { time, distance, heartrate } = steady(2000, 300, 150);
    const series = buildSeries({ distance, time, heartrate });

    expect(series).toHaveLength(distance.length);
    // Early points have no window yet, so check a settled one.
    const settled = series[100];
    expect(settled.paceSPerKm).toBeCloseTo(300, 0);
    expect(settled.heartrate).toBe(150);
  });

  it("drops implausible pace samples instead of spiking", () => {
    // Watch paused: distance frozen while time advances.
    const time = Array.from({ length: 40 }, (_, i) => i);
    const distance = Array.from({ length: 40 }, () => 500);

    const series = buildSeries({ distance, time });
    expect(series.every((point) => point.paceSPerKm === null)).toBe(true);
  });

  it("returns nothing without distance or time", () => {
    expect(buildSeries(null)).toEqual([]);
    expect(buildSeries({ heartrate: [150, 151] })).toEqual([]);
  });
});

describe("toRouteLine", () => {
  it("swaps lat/lng into GeoJSON order", () => {
    const line = toRouteLine({
      latlng: [
        [-6.2, 106.8],
        [-6.21, 106.81],
      ],
    });

    expect(line).toEqual([
      [106.8, -6.2],
      [106.81, -6.21],
    ]);
  });

  it("skips null-island fixes and malformed points", () => {
    const line = toRouteLine({
      latlng: [
        [0, 0],
        [-6.2, 106.8],
        [null, 106.9],
        "nope",
        [-6.3],
      ],
    });

    expect(line).toEqual([[106.8, -6.2]]);
  });

  it("returns an empty line when there is no GPS stream", () => {
    expect(toRouteLine(null)).toEqual([]);
    expect(toRouteLine({ heartrate: [150] })).toEqual([]);
  });
});

describe("boundsOf", () => {
  it("computes the enclosing box", () => {
    const bounds = boundsOf([
      [106.8, -6.2],
      [106.9, -6.1],
      [106.85, -6.3],
    ]);

    expect(bounds).toEqual([
      [106.8, -6.3],
      [106.9, -6.1],
    ]);
  });

  it("returns null for an empty line", () => {
    expect(boundsOf([])).toBeNull();
  });
});
