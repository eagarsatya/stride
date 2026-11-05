import { describe, expect, it } from "vitest";

import {
  EM_DASH,
  formatDuration,
  formatDurationCompact,
  formatSignedDuration,
  formatElevation,
  formatKm,
  formatSplitDistance,
  formatPace,
  formatPaceWithUnit,
  formatSignedDistance,
  parseLocalTimestamp,
  toKm,
} from "./format";

describe("formatKm", () => {
  it("converts metres to kilometres", () => {
    expect(formatKm(10_000)).toBe("10.0 km");
    expect(formatKm(21_097.5, 2)).toBe("21.10 km");
  });

  it("renders a dash for missing values", () => {
    expect(formatKm(null)).toBe(EM_DASH);
    expect(formatKm(undefined)).toBe(EM_DASH);
    expect(formatKm(Number.NaN)).toBe(EM_DASH);
  });

  it("keeps zero distinct from missing", () => {
    expect(formatKm(0)).toBe("0.0 km");
    expect(toKm(0)).toBe(0);
    expect(toKm(null)).toBeNull();
  });

  it("converts metres to miles", () => {
    expect(formatKm(10_000, 1, "mi")).toBe("6.2 mi");
    expect(formatKm(1609.344, 2, "mi")).toBe("1.00 mi");
    expect(toKm(10_000, 1, "mi")).toBeCloseTo(6.2);
  });
});

describe("formatSplitDistance", () => {
  it("uses metres under a kilometre and km above", () => {
    expect(formatSplitDistance(400)).toBe("400 m");
    expect(formatSplitDistance(1000)).toBe("1.00 km");
    expect(formatSplitDistance(null)).toBe(EM_DASH);
  });

  it("keeps track steps in metres even when the unit is miles", () => {
    expect(formatSplitDistance(400, "mi")).toBe("400 m");
    expect(formatSplitDistance(1609.344, "mi")).toBe("1.00 mi");
  });
});

describe("formatDuration", () => {
  it("omits the hour component under an hour", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(65)).toBe("1:05");
    expect(formatDuration(3599)).toBe("59:59");
  });

  it("includes hours with zero-padded minutes", () => {
    expect(formatDuration(3600)).toBe("1:00:00");
    expect(formatDuration(5025)).toBe("1:23:45");
  });

  it("rejects negative and missing values", () => {
    expect(formatDuration(-1)).toBe(EM_DASH);
    expect(formatDuration(null)).toBe(EM_DASH);
  });
});

describe("formatSignedDuration", () => {
  it("uses seconds for sub-minute gaps", () => {
    expect(formatSignedDuration(12)).toBe("+12s");
    expect(formatSignedDuration(-8.2)).toBe("−8s");
    expect(formatSignedDuration(0)).toBe("0s");
  });

  it("uses clock format once the gap reaches a minute", () => {
    expect(formatSignedDuration(63)).toBe("+1:03");
    expect(formatSignedDuration(3723)).toBe("+1:02:03");
  });

  it("renders a dash for missing values", () => {
    expect(formatSignedDuration(null)).toBe(EM_DASH);
    expect(formatSignedDuration(Number.NaN)).toBe(EM_DASH);
  });
});

describe("formatDurationCompact", () => {
  it("summarises long durations", () => {
    expect(formatDurationCompact(22_320)).toBe("6h 12m");
    expect(formatDurationCompact(2880)).toBe("48m");
    expect(formatDurationCompact(7200)).toBe("2h");
  });

  it("treats zero as missing, since a tile with 0h is noise", () => {
    expect(formatDurationCompact(0)).toBe(EM_DASH);
  });
});

describe("formatPace", () => {
  it("formats seconds per km as m:ss", () => {
    expect(formatPace(300)).toBe("5:00");
    expect(formatPace(272)).toBe("4:32");
    expect(formatPace(365)).toBe("6:05");
  });

  it("appends the unit when asked", () => {
    expect(formatPaceWithUnit(300)).toBe("5:00 /km");
    expect(formatPaceWithUnit(null)).toBe(EM_DASH);
  });

  it("converts seconds-per-km into min/mile", () => {
    expect(formatPace(300, "mi")).toBe("8:03");
    expect(formatPaceWithUnit(300, "mi")).toBe("8:03 /mi");
  });

  it("rejects non-positive paces", () => {
    expect(formatPace(0)).toBe(EM_DASH);
    expect(formatPace(-5)).toBe(EM_DASH);
  });
});

describe("formatElevation", () => {
  it("uses metres by default and feet for miles mode", () => {
    expect(formatElevation(100)).toBe("100 m");
    expect(formatElevation(100, "mi")).toBe("328 ft");
  });
});

describe("formatSignedDistance", () => {
  it("signs a kilometre or mile gap", () => {
    expect(formatSignedDistance(1200)).toBe("+1.2 km");
    expect(formatSignedDistance(-1609.344, 1, "mi")).toBe("−1.0 mi");
  });
});

describe("parseLocalTimestamp", () => {
  it("reads wall-clock parts without applying a timezone offset", () => {
    const date = parseLocalTimestamp("2026-05-01T06:12:00");

    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(4);
    expect(date.getDate()).toBe(1);
    expect(date.getHours()).toBe(6);
    expect(date.getMinutes()).toBe(12);
  });

  it("accepts a space separator and a missing seconds component", () => {
    const date = parseLocalTimestamp("2026-05-01 06:12");
    expect(date.getHours()).toBe(6);
    expect(date.getSeconds()).toBe(0);
  });
});
