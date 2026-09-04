import { describe, expect, it } from "vitest";

import {
  describeFitImport,
  distancesMatch,
  emptyFitImportCounts,
  enrichPatch,
  findMatchingActivity,
  hashFitBytes,
  isFitUploadId,
  MATCH_WINDOW_MS,
  startsMatch,
  uploadActivityId,
} from "./match";

const start = new Date("2026-04-30T23:12:00Z");

describe("hashFitBytes / uploadActivityId", () => {
  it("is stable for the same bytes and unique across files", () => {
    const a = hashFitBytes(new Uint8Array([1, 2, 3]));
    const b = hashFitBytes(new Uint8Array([1, 2, 3]));
    const c = hashFitBytes(new Uint8Array([1, 2, 4]));

    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(uploadActivityId(a)).toBe(`upload:${a}`);
    expect(isFitUploadId(uploadActivityId(a))).toBe(true);
    expect(isFitUploadId("i1234567")).toBe(false);
  });
});

describe("startsMatch / distancesMatch", () => {
  it("matches starts inside the two-minute window", () => {
    expect(startsMatch(start, new Date(start.getTime() + 90_000))).toBe(true);
    expect(startsMatch(start, new Date(start.getTime() + MATCH_WINDOW_MS + 1))).toBe(false);
  });

  it("allows a 2% or 200 m distance gap, and treats missing distance as a match", () => {
    expect(distancesMatch(10_000, 10_150)).toBe(true);
    expect(distancesMatch(10_000, 10_500)).toBe(false);
    expect(distancesMatch(1_000, 1_180)).toBe(true);
    expect(distancesMatch(10_000, null)).toBe(true);
  });
});

describe("findMatchingActivity", () => {
  const synced = {
    id: "icu-row",
    startDate: start,
    distanceM: 10_000,
  };

  it("returns the intervals row when start and distance agree", () => {
    expect(findMatchingActivity([synced], start, 10_050)?.id).toBe("icu-row");
  });

  it("skips a row whose start is outside the window", () => {
    expect(
      findMatchingActivity(
        [{ ...synced, startDate: new Date(start.getTime() + 10 * 60_000) }],
        start,
        10_000,
      ),
    ).toBeNull();
  });

  it("skips a row with a very different distance", () => {
    expect(findMatchingActivity([{ ...synced, distanceM: 5_000 }], start, 10_000)).toBeNull();
  });

  it("picks the closest start when two rows fall in the window", () => {
    const farther = { id: "far", startDate: new Date(start.getTime() + 80_000), distanceM: 10_000 };
    const nearer = { id: "near", startDate: new Date(start.getTime() + 10_000), distanceM: 10_000 };

    expect(findMatchingActivity([farther, nearer], start, 10_000)?.id).toBe("near");
  });
});

describe("enrichPatch", () => {
  it("fills only null fields and never overwrites Intervals metrics", () => {
    const patch = enrichPatch(
      {
        name: "Morning Run",
        calories: null,
        elevationLossM: null,
        avgHr: 152,
        trainingLoad: 95,
        ctl: 55,
        hasGps: false,
        streamTypes: null,
      },
      {
        name: "Run — 2026-05-01",
        calories: 700,
        elevationLossM: 80,
        avgHr: 160,
        trainingLoad: 1,
        ctl: 1,
        hasGps: true,
        streamTypes: ["time", "distance", "latlng"],
      },
    );

    expect(patch).toEqual({
      calories: 700,
      elevationLossM: 80,
      hasGps: true,
      streamTypes: ["time", "distance", "latlng"],
    });
    expect(patch).not.toHaveProperty("name");
    expect(patch).not.toHaveProperty("avgHr");
    expect(patch).not.toHaveProperty("trainingLoad");
    expect(patch).not.toHaveProperty("ctl");
  });
});

describe("describeFitImport", () => {
  it("summarises a mixed batch", () => {
    expect(
      describeFitImport(
        { imported: 2, enriched: 1, alreadyImported: 3, skippedNonRun: 1, failed: 1 },
        8,
      ),
    ).toBe(
      "Imported 2 runs, filled in 1 already-synced run, skipped 3 already imported, skipped 1 non-run, 1 failed.",
    );
  });

  it("handles an empty selection", () => {
    expect(describeFitImport(emptyFitImportCounts(), 0)).toBe("No .fit files found.");
  });
});
