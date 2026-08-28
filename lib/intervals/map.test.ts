import { describe, expect, it } from "vitest";

import { downsample, mapActivity, mapStreams, mapWellness, speedToPace } from "./map";
import { activitySchema, isRunType, wellnessSchema } from "./schemas";

const RAW_RUN = {
  id: "i1234567",
  start_date_local: "2026-05-01T06:12:00",
  start_date: "2026-04-30T23:12:00Z",
  timezone: "Asia/Jakarta",
  name: "Morning Run",
  type: "Run",
  distance: 10_000,
  moving_time: 3000,
  elapsed_time: 3120,
  total_elevation_gain: 85,
  average_speed: 3.3333333,
  max_speed: 4.5,
  gap: 3.5,
  average_heartrate: 152.4,
  max_heartrate: 171,
  average_cadence: 82.5,
  calories: 700,
  icu_training_load: 95,
  icu_atl: 60.5,
  icu_ctl: 55.25,
  icu_intensity: 0.85,
  icu_efficiency_factor: 1.72,
  decoupling: 3.4,
  average_stride: 1.21,
  trimp: 88,
  icu_hr_zone_times: [600, 1200, 900, 300, 0],
  pace_zone_times: [500, 1000, 1100, 400, 0],
  race: false,
  trainer: false,
  feel: 4,
  icu_rpe: 5,
  device_name: "COROS PACE 3",
  source: "COROS",
  stream_types: ["time", "distance", "heartrate", "latlng"],
};

function parseRun(overrides: Record<string, unknown> = {}) {
  const parsed = activitySchema.safeParse({ ...RAW_RUN, ...overrides });
  if (!parsed.success) throw new Error(`fixture failed to parse: ${parsed.error.message}`);
  return parsed.data;
}

describe("activitySchema", () => {
  it("parses a COROS run", () => {
    expect(parseRun().id).toBe("i1234567");
  });

  it("coerces a numeric id to a string", () => {
    expect(parseRun({ id: 987654 }).id).toBe("987654");
  });

  it("degrades an unexpected field type to null instead of failing", () => {
    const run = parseRun({ average_heartrate: "not-a-number" });
    expect(run.average_heartrate).toBeNull();
    expect(run.distance).toBe(10_000);
  });

  it("rejects a payload with no start date", () => {
    const { start_date_local: _omitted, ...rest } = RAW_RUN;
    expect(activitySchema.safeParse(rest).success).toBe(false);
  });
});

describe("isRunType", () => {
  it("accepts the run family", () => {
    expect(isRunType("Run")).toBe(true);
    expect(isRunType("TrailRun")).toBe(true);
    expect(isRunType("VirtualRun")).toBe(true);
  });

  it("rejects other sports and empty values", () => {
    expect(isRunType("Ride")).toBe(false);
    expect(isRunType("Walk")).toBe(false);
    expect(isRunType(null)).toBe(false);
    expect(isRunType(undefined)).toBe(false);
  });
});

describe("speedToPace", () => {
  it("converts m/s to seconds per km", () => {
    expect(speedToPace(3.3333333)).toBeCloseTo(300, 3);
    expect(speedToPace(5)).toBe(200);
  });

  it("returns null for non-positive or missing speeds", () => {
    expect(speedToPace(0)).toBeNull();
    expect(speedToPace(-1)).toBeNull();
    expect(speedToPace(null)).toBeNull();
    expect(speedToPace(undefined)).toBeNull();
  });

  it("discards implausibly slow samples", () => {
    // 0.3 m/s would be ~55 min/km, which means the watch was paused.
    expect(speedToPace(0.3)).toBeNull();
  });
});

describe("mapActivity", () => {
  it("maps the fields the dashboard queries", () => {
    const row = mapActivity("user-1", parseRun());

    expect(row.userId).toBe("user-1");
    expect(row.icuActivityId).toBe("i1234567");
    expect(row.distanceM).toBe(10_000);
    expect(row.movingTimeS).toBe(3000);
    expect(row.paceSPerKm).toBeCloseTo(300, 3);
    expect(row.gapSPerKm).toBeCloseTo(1000 / 3.5, 6);
    expect(row.avgHr).toBe(152);
    expect(row.trainingLoad).toBe(95);
    expect(row.deviceName).toBe("COROS PACE 3");
    expect(row.source).toBe("COROS");
  });

  it("keeps the local start time as wall-clock, with no timezone shift", () => {
    const row = mapActivity("user-1", parseRun());
    expect(row.startDateLocal).toBe("2026-05-01T06:12:00");
  });

  it("strips a timezone suffix from the local start time", () => {
    const row = mapActivity("user-1", parseRun({ start_date_local: "2026-05-01T06:12:00Z" }));
    expect(row.startDateLocal).toBe("2026-05-01T06:12:00");
  });

  it("parses the UTC start into a Date", () => {
    const row = mapActivity("user-1", parseRun());
    expect(row.startDate).toEqual(new Date("2026-04-30T23:12:00Z"));
  });

  it("flags GPS from the stream list", () => {
    expect(mapActivity("u", parseRun()).hasGps).toBe(true);
    expect(
      mapActivity("u", parseRun({ stream_types: ["time", "heartrate"] })).hasGps,
    ).toBe(false);
    expect(mapActivity("u", parseRun({ stream_types: null })).hasGps).toBe(false);
  });

  it("maps race and treadmill flags to non-null booleans", () => {
    const plain = mapActivity("u", parseRun({ race: null, trainer: null }));
    expect(plain.isRace).toBe(false);
    expect(plain.isTreadmill).toBe(false);

    const race = mapActivity("u", parseRun({ race: true, trainer: true }));
    expect(race.isRace).toBe(true);
    expect(race.isTreadmill).toBe(true);
  });

  it("falls back to perceived_exertion when icu_rpe is absent", () => {
    const row = mapActivity("u", parseRun({ icu_rpe: null, perceived_exertion: 7 }));
    expect(row.rpe).toBe(7);
  });

  it("falls back to icu_distance when distance is missing", () => {
    const row = mapActivity("u", parseRun({ distance: null, icu_distance: 8000 }));
    expect(row.distanceM).toBe(8000);
  });

  it("keeps the full payload for later use", () => {
    const row = mapActivity("u", parseRun());
    expect((row.raw as { device_name: string }).device_name).toBe("COROS PACE 3");
  });
});

describe("downsample", () => {
  it("leaves short series untouched", () => {
    const input = [1, 2, 3];
    expect(downsample(input, 10)).toBe(input);
  });

  it("caps the length and preserves the endpoints", () => {
    const input = Array.from({ length: 10_000 }, (_, i) => i);
    const result = downsample(input, 1000);

    expect(result.length).toBeLessThanOrEqual(1001);
    expect(result[0]).toBe(0);
    expect(result[result.length - 1]).toBe(9999);
  });

  it("appends the final sample when striding would skip it", () => {
    const result = downsample([0, 1, 2, 3, 4, 5, 6], 3);
    expect(result[result.length - 1]).toBe(6);
  });
});

describe("mapStreams", () => {
  it("keys streams by type and reports the longest length", () => {
    const { data, pointCount } = mapStreams([
      { type: "heartrate", data: Array.from({ length: 5000 }, () => 150) },
      { type: "latlng", data: [[1, 2] as unknown, [3, 4] as unknown] },
    ]);

    expect(Object.keys(data).sort()).toEqual(["heartrate", "latlng"]);
    expect(data.latlng).toHaveLength(2);
    expect(pointCount).toBeLessThanOrEqual(1001);
    expect(pointCount).toBeGreaterThan(900);
  });
});

describe("mapWellness", () => {
  it("uses the id field as the date and maps camelCase metrics", () => {
    const parsed = wellnessSchema.parse({
      id: "2026-05-01",
      ctl: 55.2,
      atl: 61.9,
      weight: 68.4,
      restingHR: 44,
      hrv: 78.5,
      sleepSecs: 27_000,
      steps: 12_500,
    });

    const row = mapWellness("user-1", parsed);
    expect(row.date).toBe("2026-05-01");
    expect(row.restingHr).toBe(44);
    expect(row.sleepSecs).toBe(27_000);
    expect(row.ctl).toBe(55.2);
  });
});
