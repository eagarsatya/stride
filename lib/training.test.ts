import { describe, expect, it } from "vitest";

import { intervalSchema, intervalsDtoSchema } from "./intervals/schemas";
import {
  dropWholeActivityInterval,
  isStructuredTraining,
  mapFitLaps,
  mapIcuIntervals,
  pruneAutolaps,
  type TrainingStep,
} from "./training";

function step(partial: Partial<TrainingStep> & Pick<TrainingStep, "index">): TrainingStep {
  return {
    label: null,
    type: null,
    groupLabel: null,
    distanceM: null,
    elapsedS: null,
    paceSPerKm: null,
    avgHr: null,
    maxHr: null,
    ...partial,
  };
}

describe("isStructuredTraining", () => {
  it("hides even-kilometre autolaps, including a short last split", () => {
    const steps = [
      step({ index: 1, distanceM: 1000, elapsedS: 300, paceSPerKm: 300 }),
      step({ index: 2, distanceM: 1000, elapsedS: 305, paceSPerKm: 305 }),
      step({ index: 3, distanceM: 1000, elapsedS: 298, paceSPerKm: 298 }),
      step({ index: 4, distanceM: 420, elapsedS: 130, paceSPerKm: 310 }),
    ];
    expect(isStructuredTraining(steps)).toBe(false);
  });

  it("treats work/rest types as a workout even when reps are 1 km", () => {
    const steps = [
      step({ index: 1, type: "Work", distanceM: 1000, elapsedS: 240, paceSPerKm: 240 }),
      step({ index: 2, type: "Rest", distanceM: 200, elapsedS: 90, paceSPerKm: 450 }),
      step({ index: 3, type: "Work", distanceM: 1000, elapsedS: 238, paceSPerKm: 238 }),
    ];
    expect(isStructuredTraining(steps)).toBe(true);
  });

  it("treats irregular lap distances as a workout", () => {
    const steps = [
      step({ index: 1, distanceM: 400, elapsedS: 80, paceSPerKm: 200 }),
      step({ index: 2, distanceM: 200, elapsedS: 90, paceSPerKm: 450 }),
      step({ index: 3, distanceM: 400, elapsedS: 82, paceSPerKm: 205 }),
    ];
    expect(isStructuredTraining(steps)).toBe(true);
  });

  it("needs at least two steps", () => {
    expect(isStructuredTraining([])).toBe(false);
    expect(isStructuredTraining([step({ index: 1, type: "Work", distanceM: 400 })])).toBe(false);
  });
});

describe("dropWholeActivityInterval", () => {
  it("drops a wrapper that is the sum of the other steps", () => {
    const intervals = [
      { distance: 10_000 },
      { distance: 1000 },
      { distance: 1000 },
      { distance: 1000 },
      { distance: 1000 },
      { distance: 1000 },
      { distance: 1000 },
      { distance: 1000 },
      { distance: 1000 },
      { distance: 1000 },
      { distance: 1000 },
    ];
    expect(dropWholeActivityInterval(intervals)).toHaveLength(10);
  });

  it("keeps two similar-length halves", () => {
    const intervals = [{ distance: 5000 }, { distance: 5000 }];
    expect(dropWholeActivityInterval(intervals)).toHaveLength(2);
  });
});

describe("pruneAutolaps", () => {
  it("drops even-km autolaps once workout-typed steps exist", () => {
    const steps = [
      step({ index: 1, distanceM: 1000, elapsedS: 300 }),
      step({ index: 2, type: "Work", distanceM: 400, elapsedS: 80 }),
      step({ index: 3, type: "Rest", distanceM: 200, elapsedS: 90 }),
      step({ index: 4, distanceM: 1000, elapsedS: 310 }),
    ];
    const pruned = pruneAutolaps(steps);
    expect(pruned).toHaveLength(2);
    expect(pruned.map((row) => row.type)).toEqual(["Work", "Rest"]);
  });

  it("keeps 1 km work reps", () => {
    const steps = [
      step({ index: 1, type: "Work", distanceM: 1000, elapsedS: 240 }),
      step({ index: 2, type: "Rest", distanceM: 150, elapsedS: 60 }),
    ];
    expect(pruneAutolaps(steps)).toHaveLength(2);
  });
});

describe("mapIcuIntervals", () => {
  it("maps pace from speed and attaches group labels", () => {
    const parsed = intervalsDtoSchema.parse({
      icu_intervals: [
        {
          type: "Work",
          label: "Rep 1",
          group_id: 1,
          distance: 400,
          moving_time: 80,
          average_speed: 5,
          average_heartrate: 172,
        },
        {
          type: "Rest",
          group_id: 1,
          distance: 200,
          moving_time: 90,
          average_speed: 2.22,
          average_heartrate: 141,
        },
      ],
      icu_groups: [{ id: 1, label: "Set 1" }],
    });

    const steps = mapIcuIntervals(parsed.icu_intervals, parsed.icu_groups);
    expect(steps).toHaveLength(2);
    expect(steps[0].type).toBe("work");
    expect(steps[0].label).toBe("Rep 1");
    expect(steps[0].groupLabel).toBe("Set 1");
    expect(steps[0].paceSPerKm).toBeCloseTo(200, 0);
    expect(steps[0].avgHr).toBe(172);
    expect(steps[1].type).toBe("rest");
  });

  it("computes pace from distance and time when speed is missing", () => {
    const interval = intervalSchema.parse({
      type: "Warmup",
      distance: 1000,
      moving_time: 360,
    });
    const [warmup] = mapIcuIntervals([interval]);
    expect(warmup.paceSPerKm).toBeCloseTo(360, 0);
  });
});

describe("mapFitLaps", () => {
  it("maps FIT intensity onto step types", () => {
    const steps = mapFitLaps([
      {
        totalDistance: 800,
        totalTimerTime: 300,
        avgSpeed: 800 / 300,
        intensity: "warmup",
        avgHeartRate: 138,
      },
      {
        totalDistance: 400,
        totalTimerTime: 80,
        avgSpeed: 5,
        intensity: "interval",
        avgHeartRate: 174,
      },
      {
        totalDistance: 200,
        totalTimerTime: 90,
        avgSpeed: 2.22,
        intensity: 1,
        avgHeartRate: 140,
      },
    ]);

    expect(steps.map((row) => row.type)).toEqual(["warmup", "interval", "rest"]);
    expect(isStructuredTraining(steps)).toBe(true);
  });

  it("does not treat active 1 km autolaps as a workout", () => {
    const steps = mapFitLaps([
      { totalDistance: 1000, totalTimerTime: 300, avgSpeed: 1000 / 300, intensity: "active" },
      { totalDistance: 1000, totalTimerTime: 305, avgSpeed: 1000 / 305, intensity: 0 },
      { totalDistance: 400, totalTimerTime: 130, avgSpeed: 400 / 130, intensity: "active" },
    ]);

    expect(steps.every((row) => row.type === null)).toBe(true);
    expect(isStructuredTraining(steps)).toBe(false);
  });
});
