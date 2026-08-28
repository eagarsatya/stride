import { describe, expect, it } from "vitest";

import { toApiDate } from "./intervals/client";
import { buildWindows } from "./sync";

function asDates(windows: Array<{ oldest: Date; newest: Date }>) {
  return windows.map((w) => [toApiDate(w.oldest), toApiDate(w.newest)]);
}

describe("buildWindows", () => {
  it("splits three years into six-month windows, newest first", () => {
    const windows = buildWindows({
      oldest: new Date(2023, 0, 1),
      newest: new Date(2026, 0, 1),
    });

    expect(windows).toHaveLength(6);
    expect(asDates(windows)[0]).toEqual(["2025-07-01", "2026-01-01"]);
    // Newest-first ordering means recent runs land in the database first.
    expect(windows[0].newest.getTime()).toBeGreaterThan(windows[1].newest.getTime());
  });

  it("covers the whole range with no gaps and no overlaps", () => {
    const oldest = new Date(2023, 0, 1);
    const newest = new Date(2026, 0, 1);
    const windows = buildWindows({ oldest, newest });

    expect(toApiDate(windows[0].newest)).toBe(toApiDate(newest));
    expect(toApiDate(windows[windows.length - 1].oldest)).toBe(toApiDate(oldest));

    for (let i = 1; i < windows.length; i += 1) {
      const previousOldest = windows[i - 1].oldest;
      const currentNewest = windows[i].newest;
      const gapDays = (previousOldest.getTime() - currentNewest.getTime()) / 86_400_000;
      // Consecutive windows meet one day apart, so `oldest` is never re-fetched.
      expect(gapDays).toBeCloseTo(1, 5);
    }
  });

  it("clamps the final window to the requested start", () => {
    const oldest = new Date(2025, 3, 15);
    const windows = buildWindows({ oldest, newest: new Date(2026, 0, 1) });

    expect(windows).toHaveLength(2);
    expect(toApiDate(windows[windows.length - 1].oldest)).toBe("2025-04-15");
  });

  it("returns a single window for a range shorter than the window size", () => {
    const windows = buildWindows({
      oldest: new Date(2026, 0, 1),
      newest: new Date(2026, 0, 20),
    });

    expect(windows).toHaveLength(1);
    expect(asDates(windows)[0]).toEqual(["2026-01-01", "2026-01-20"]);
  });

  it("never returns an empty list, even for a zero-length range", () => {
    const day = new Date(2026, 0, 1);
    const windows = buildWindows({ oldest: day, newest: day });

    expect(windows).toHaveLength(1);
    expect(asDates(windows)[0]).toEqual(["2026-01-01", "2026-01-01"]);
  });

  it("honours a custom window size for wellness pulls", () => {
    const windows = buildWindows(
      { oldest: new Date(2023, 0, 1), newest: new Date(2026, 0, 1) },
      12,
    );

    expect(windows).toHaveLength(3);
  });
});

describe("toApiDate", () => {
  it("formats a Date as local YYYY-MM-DD", () => {
    expect(toApiDate(new Date(2026, 4, 1, 23, 30))).toBe("2026-05-01");
  });

  it("truncates an ISO string without shifting the day", () => {
    expect(toApiDate("2026-05-01T06:12:00")).toBe("2026-05-01");
  });
});
