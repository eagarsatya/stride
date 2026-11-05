import { describe, expect, it } from "vitest";

import {
  isDistanceUnit,
  kmToUnit,
  metresToUnit,
  paceToUnit,
  splitMetresFor,
} from "./units";

describe("units", () => {
  it("converts metres and pace into miles", () => {
    expect(metresToUnit(10_000, "mi")).toBeCloseTo(6.2137, 3);
    expect(paceToUnit(300, "mi")).toBeCloseTo(482.8, 1);
    expect(kmToUnit(10, "mi")).toBeCloseTo(6.2137, 3);
  });

  it("leaves metric values unchanged", () => {
    expect(metresToUnit(10_000, "km")).toBe(10);
    expect(paceToUnit(300, "km")).toBe(300);
    expect(splitMetresFor("km")).toBe(1000);
    expect(splitMetresFor("mi")).toBeCloseTo(1609.344);
  });

  it("narrows stored unit strings", () => {
    expect(isDistanceUnit("km")).toBe(true);
    expect(isDistanceUnit("mi")).toBe(true);
    expect(isDistanceUnit("yd")).toBe(false);
  });
});
