import { describe, expect, it } from "vitest";

import { computeBestEfforts } from "./records";

/** Build distance/time streams for a run at a constant pace, sampled at 1 Hz. */
function steadyRun(totalMetres: number, paceSPerKm: number) {
  const speed = 1000 / paceSPerKm;
  const seconds = Math.round(totalMetres / speed);

  const time: number[] = [];
  const distance: number[] = [];
  for (let t = 0; t <= seconds; t += 1) {
    time.push(t);
    distance.push(Math.min(t * speed, totalMetres));
  }
  return { time, distance };
}

describe("computeBestEfforts", () => {
  it("finds a 5K at constant pace", () => {
    const { time, distance } = steadyRun(10_000, 300);
    const efforts = computeBestEfforts(distance, time);

    // 5 km at 5:00/km is 1500 s.
    expect(efforts["5000"]).toBeCloseTo(1500, 0);
    expect(efforts["1000"]).toBeCloseTo(300, 0);
    expect(efforts["10000"]).toBeCloseTo(3000, 0);
  });

  it("omits distances the run never reached", () => {
    const { time, distance } = steadyRun(3000, 300);
    const efforts = computeBestEfforts(distance, time);

    expect(efforts["1000"]).toBeDefined();
    expect(efforts["5000"]).toBeUndefined();
    expect(efforts["42195"]).toBeUndefined();
  });

  it("finds the fastest window, not the first or the average", () => {
    // 2 km easy at 6:00/km, then 1 km hard at 4:00/km, then 2 km easy.
    const time: number[] = [0];
    const distance: number[] = [0];

    function leg(metres: number, paceSPerKm: number) {
      const speed = 1000 / paceSPerKm;
      const seconds = Math.round(metres / speed);
      const startD = distance[distance.length - 1];
      const startT = time[time.length - 1];
      for (let t = 1; t <= seconds; t += 1) {
        time.push(startT + t);
        distance.push(startD + t * speed);
      }
    }

    leg(2000, 360);
    leg(1000, 240);
    leg(2000, 360);

    const efforts = computeBestEfforts(distance, time);

    // The best 1 km should be the hard rep, near 240 s, not the 360 s average.
    expect(efforts["1000"]).toBeGreaterThan(235);
    expect(efforts["1000"]).toBeLessThan(250);
  });

  it("interpolates rather than rounding up to the next sample", () => {
    // Sample every 10 s at 5:00/km, so samples land every ~33.3 m and 1000 m
    // falls between two of them.
    const speed = 1000 / 300;
    const time: number[] = [];
    const distance: number[] = [];
    for (let t = 0; t <= 900; t += 10) {
      time.push(t);
      distance.push(t * speed);
    }

    const efforts = computeBestEfforts(distance, time);
    expect(efforts["1000"]).toBeGreaterThan(299);
    expect(efforts["1000"]).toBeLessThan(301);
  });

  it("tolerates a paused watch with repeated distances", () => {
    const time = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    // Stationary for the first 5 samples, then 200 m/s (unrealistic but tests
    // that zero-length lead segments do not divide by zero).
    const distance = [0, 0, 0, 0, 0, 0, 200, 400, 600, 800, 1000];

    const efforts = computeBestEfforts(distance, time, [1000]);
    expect(efforts["1000"]).toBeCloseTo(5, 1);
  });

  it("returns nothing without usable streams", () => {
    expect(computeBestEfforts(undefined, undefined)).toEqual({});
    expect(computeBestEfforts([], [])).toEqual({});
    expect(computeBestEfforts([0, 1], undefined)).toEqual({});
    // Non-numeric samples (e.g. latlng pairs passed by mistake).
    expect(computeBestEfforts([[0, 0] as unknown, [1, 1] as unknown], [0, 1])).toEqual({});
  });

  it("handles a marathon-length stream without blowing up", () => {
    const { time, distance } = steadyRun(42_500, 330);
    const efforts = computeBestEfforts(distance, time);

    expect(efforts["42195"]).toBeCloseTo(42.195 * 330, -1);
    expect(Object.keys(efforts)).toHaveLength(5);
  });
});
