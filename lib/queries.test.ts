import { describe, expect, it } from "vitest";

import { activityRangeBounds, parseIsoDay } from "./queries";

describe("parseIsoDay", () => {
  it("accepts a calendar day", () => {
    expect(parseIsoDay("2026-11-06")).toBe("2026-11-06");
  });

  it("rejects impossible dates that JS would roll over", () => {
    expect(parseIsoDay("2026-02-31")).toBeNull();
  });

  it("rejects junk", () => {
    expect(parseIsoDay("yesterday")).toBeNull();
    expect(parseIsoDay("")).toBeNull();
    expect(parseIsoDay(null)).toBeNull();
  });
});

describe("activityRangeBounds", () => {
  const now = new Date(2026, 10, 6);

  it("uses a rolling window for presets", () => {
    expect(activityRangeBounds({ range: "90d", from: null, to: null }, now)).toEqual({
      from: "2026-08-08",
      toExclusive: null,
    });
  });

  it("leaves all-time unbounded", () => {
    expect(activityRangeBounds({ range: "all", from: null, to: null }, now)).toEqual({
      from: null,
      toExclusive: null,
    });
  });

  it("applies an inclusive custom range as an exclusive upper bound", () => {
    expect(
      activityRangeBounds({ range: "custom", from: "2026-01-01", to: "2026-01-31" }, now),
    ).toEqual({
      from: "2026-01-01",
      toExclusive: "2026-02-01",
    });
  });

  it("swaps inverted custom dates", () => {
    expect(
      activityRangeBounds({ range: "custom", from: "2026-03-01", to: "2026-01-01" }, now),
    ).toEqual({
      from: "2026-01-01",
      toExclusive: "2026-03-02",
    });
  });

  it("allows an open-ended custom from", () => {
    expect(activityRangeBounds({ range: "custom", from: "2026-01-01", to: null }, now)).toEqual({
      from: "2026-01-01",
      toExclusive: null,
    });
  });

  it("allows an open-ended custom to", () => {
    expect(activityRangeBounds({ range: "custom", from: null, to: "2026-03-15" }, now)).toEqual({
      from: null,
      toExclusive: "2026-03-16",
    });
  });
});
