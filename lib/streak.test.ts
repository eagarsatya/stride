import { describe, expect, it } from "vitest";

import { computeLongestStreak, computeStreak } from "./streak";

const TODAY = new Date(2026, 4, 20); // 20 May 2026, local

describe("computeStreak", () => {
  it("counts consecutive days ending today", () => {
    const days = ["2026-05-20", "2026-05-19", "2026-05-18"];
    expect(computeStreak(days, TODAY)).toBe(3);
  });

  it("keeps the streak alive when the last run was yesterday", () => {
    // Not having run yet today should not read as a broken streak.
    const days = ["2026-05-19", "2026-05-18", "2026-05-17"];
    expect(computeStreak(days, TODAY)).toBe(3);
  });

  it("breaks when the last run was two days ago", () => {
    expect(computeStreak(["2026-05-18", "2026-05-17"], TODAY)).toBe(0);
  });

  it("stops at the first gap", () => {
    const days = ["2026-05-20", "2026-05-19", "2026-05-17", "2026-05-16"];
    expect(computeStreak(days, TODAY)).toBe(2);
  });

  it("counts two runs on one day once", () => {
    const days = ["2026-05-20", "2026-05-20", "2026-05-19"];
    expect(computeStreak(days, TODAY)).toBe(2);
  });

  it("handles full timestamps, not just dates", () => {
    const days = ["2026-05-20T06:12:00", "2026-05-19T18:40:00"];
    expect(computeStreak(days, TODAY)).toBe(2);
  });

  it("returns zero with no history", () => {
    expect(computeStreak([], TODAY)).toBe(0);
  });

  it("crosses a month boundary", () => {
    const days = ["2026-05-02", "2026-05-01", "2026-04-30", "2026-04-29"];
    expect(computeStreak(days, new Date(2026, 4, 2))).toBe(4);
  });

  it("tolerates unsorted input", () => {
    const days = ["2026-05-18", "2026-05-20", "2026-05-19"];
    expect(computeStreak(days, TODAY)).toBe(3);
  });
});

describe("computeLongestStreak", () => {
  it("finds the longest run anywhere in history", () => {
    const days = [
      "2026-05-20",
      "2026-05-19",
      // gap
      "2026-04-10",
      "2026-04-09",
      "2026-04-08",
      "2026-04-07",
    ];
    expect(computeLongestStreak(days)).toBe(4);
  });

  it("returns 1 for a single run", () => {
    expect(computeLongestStreak(["2026-05-20"])).toBe(1);
  });

  it("returns 0 with no history", () => {
    expect(computeLongestStreak([])).toBe(0);
  });
});
