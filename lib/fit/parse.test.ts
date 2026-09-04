import { describe, expect, it } from "vitest";

import type { FitMessages } from "@garmin/fitsdk";

import {
  deviceNameFromMessages,
  formatWallClock,
  isRunningSport,
  mapRunType,
  messagesToParsed,
  recordsToStreamChannels,
  toDate,
  toDegrees,
} from "./parse";

describe("isRunningSport", () => {
  it("accepts running and treadmill fitness-equipment sessions", () => {
    expect(isRunningSport("running", "generic")).toBe(true);
    expect(isRunningSport(1, null)).toBe(true);
    expect(isRunningSport("fitnessEquipment", "treadmill")).toBe(true);
  });

  it("treats a missing sport as a run", () => {
    expect(isRunningSport(undefined, undefined)).toBe(true);
  });

  it("rejects other sports", () => {
    expect(isRunningSport("cycling", "generic")).toBe(false);
    expect(isRunningSport("swimming", null)).toBe(false);
    expect(isRunningSport("walking", "generic")).toBe(false);
  });
});

describe("mapRunType", () => {
  it("maps trail and treadmill sub-sports", () => {
    expect(mapRunType("running", "trail")).toEqual({
      type: "TrailRun",
      subType: "trail",
      isTreadmill: false,
    });
    expect(mapRunType("running", "treadmill")).toEqual({
      type: "VirtualRun",
      subType: "treadmill",
      isTreadmill: true,
    });
    expect(mapRunType("running", "generic")).toEqual({
      type: "Run",
      subType: "generic",
      isTreadmill: false,
    });
  });
});

describe("toDegrees", () => {
  it("leaves already-converted coordinates alone", () => {
    expect(toDegrees(-6.2)).toBeCloseTo(-6.2);
    expect(toDegrees(106.8)).toBeCloseTo(106.8);
  });

  it("converts signed semicircles", () => {
    const equator = toDegrees(0);
    expect(equator).toBe(0);
    const north = toDegrees(Math.round((6.2 * 2 ** 31) / 180));
    expect(north).toBeCloseTo(6.2, 3);
  });
});

describe("toDate / formatWallClock", () => {
  it("keeps a Date and formats UTC components as wall-clock", () => {
    const date = new Date("2026-04-30T23:12:00Z");
    expect(toDate(date)).toEqual(date);
    expect(formatWallClock(date)).toBe("2026-04-30T23:12:00");
  });
});

describe("deviceNameFromMessages", () => {
  it("prefixes a COROS product name with the brand", () => {
    expect(
      deviceNameFromMessages({
        fileIdMesgs: [{ manufacturer: "coros", productName: "PACE 3" }],
      }),
    ).toBe("COROS PACE 3");
  });
});

describe("recordsToStreamChannels", () => {
  it("builds Intervals-shaped channels and elapsed time from timestamps", () => {
    const start = new Date("2026-04-30T23:12:00Z");
    const channels = recordsToStreamChannels(
      [
        {
          timestamp: start,
          distance: 0,
          heartRate: 140,
          positionLat: -6.2,
          positionLong: 106.8,
          enhancedSpeed: 3.3,
        },
        {
          timestamp: new Date(start.getTime() + 10_000),
          distance: 33,
          heartRate: 148,
          positionLat: -6.21,
          positionLong: 106.81,
          enhancedSpeed: 3.4,
        },
      ],
      start.getTime(),
    );

    const byType = Object.fromEntries(channels.map((channel) => [channel.type, channel.data]));
    expect(byType.time).toEqual([0, 10]);
    expect(byType.distance).toEqual([0, 33]);
    expect(byType.heartrate).toEqual([140, 148]);
    expect(byType.latlng).toEqual([
      [-6.2, 106.8],
      [-6.21, 106.81],
    ]);
    expect(byType.velocity_smooth).toEqual([3.3, 3.4]);
  });
});

describe("messagesToParsed", () => {
  const start = new Date("2026-04-30T23:12:00Z");
  const local = new Date("2026-05-01T06:12:00Z");

  const runMessages = {
    fileIdMesgs: [{ manufacturer: "coros", serialNumber: 12345, productName: "PACE 3" }],
    activityMesgs: [{ localTimestamp: local }],
    sessionMesgs: [
      {
        sport: "running",
        subSport: "generic",
        startTime: start,
        totalDistance: 10_000,
        totalTimerTime: 3000,
        totalElapsedTime: 3120,
        totalAscent: 85,
        totalDescent: 80,
        avgSpeed: 3.333,
        maxSpeed: 4.5,
        avgHeartRate: 152,
        maxHeartRate: 171,
        avgCadence: 82,
        totalCalories: 700,
        avgStepLength: 1210,
      },
    ],
    recordMesgs: [
      { timestamp: start, distance: 0, heartRate: 140, positionLat: -6.2, positionLong: 106.8 },
      {
        timestamp: new Date(start.getTime() + 3000_000),
        distance: 10_000,
        heartRate: 160,
        positionLat: -6.3,
        positionLong: 106.9,
      },
    ],
  } satisfies FitMessages;

  it("maps a COROS run session onto dashboard fields", () => {
    const result = messagesToParsed(runMessages);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { summary } = result.activity;
    expect(summary.type).toBe("Run");
    expect(summary.startDate).toEqual(start);
    expect(summary.startDateLocal).toBe("2026-05-01T06:12:00");
    expect(summary.distanceM).toBe(10_000);
    expect(summary.movingTimeS).toBe(3000);
    expect(summary.paceSPerKm).toBeCloseTo(300, 0);
    expect(summary.avgHr).toBe(152);
    expect(summary.avgStrideM).toBeCloseTo(1.21);
    expect(summary.deviceName).toBe("COROS PACE 3");
    expect(summary.externalId).toBe(`coros:12345:${start.getTime()}`);
    expect(summary.hasGps).toBe(true);
    expect(summary.streamTypes).toContain("latlng");
    expect(result.activity.raw.source).toBe("fit");
  });

  it("rejects a cycling session", () => {
    const result = messagesToParsed({
      sessionMesgs: [{ sport: "cycling", startTime: start, totalDistance: 20_000 }],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("not-a-run");
  });
});
