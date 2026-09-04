import { zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import {
  expandUploads,
  extractFitFilesFromZip,
  isFitName,
  isSafeZipPath,
  isZipName,
  MAX_FIT_FILES,
} from "./zip";

const tinyFit = new Uint8Array([0x0e, 0x10, 0x43, 0x4f, 0x52, 0x4f, 0x53]);

describe("isFitName / isZipName", () => {
  it("matches extensions case-insensitively and ignores directories", () => {
    expect(isFitName("Morning_Run.FIT")).toBe(true);
    expect(isFitName("exports/2026/run.fit")).toBe(true);
    expect(isFitName(".hidden.fit")).toBe(false);
    expect(isZipName("activities.zip")).toBe(true);
    expect(isZipName("run.fit")).toBe(false);
  });
});

describe("isSafeZipPath", () => {
  it("allows nested .fit files and rejects traversal", () => {
    expect(isSafeZipPath("COROS/2026/run.fit")).toBe(true);
    expect(isSafeZipPath("../run.fit")).toBe(false);
    expect(isSafeZipPath("foo/../run.fit")).toBe(false);
    expect(isSafeZipPath("/abs/run.fit")).toBe(false);
    expect(isSafeZipPath("C:/run.fit")).toBe(false);
    expect(isSafeZipPath("notes.txt")).toBe(false);
    expect(isSafeZipPath("folder/")).toBe(false);
  });
});

describe("extractFitFilesFromZip", () => {
  it("pulls nested .fit files and ignores everything else", () => {
    const archive = zipSync({
      "readme.txt": new Uint8Array([1, 2, 3]),
      "COROS/export/a.fit": tinyFit,
      "COROS/export/b.FIT": tinyFit,
    });

    const { payloads, truncated } = extractFitFilesFromZip(archive);
    expect(truncated).toBe(false);
    expect(payloads.map((entry) => entry.name).sort()).toEqual([
      "COROS/export/a.fit",
      "COROS/export/b.FIT",
    ]);
    expect(payloads[0].bytes).toEqual(tinyFit);
  });

  it("skips path-traversal entries", () => {
    const archive = zipSync({
      "safe.fit": tinyFit,
      "../escape.fit": tinyFit,
    });

    const { payloads } = extractFitFilesFromZip(archive);
    expect(payloads.map((entry) => entry.name)).toEqual(["safe.fit"]);
  });
});

describe("expandUploads", () => {
  it("flattens zips and loose FIT files into one list", () => {
    const archive = zipSync({
      "nested/one.fit": tinyFit,
      "skip.me": new Uint8Array([9]),
    });

    const { payloads, failed, truncated } = expandUploads([
      { name: "batch.zip", bytes: archive },
      { name: "solo.fit", bytes: tinyFit },
    ]);

    expect(truncated).toBe(false);
    expect(failed).toBe(0);
    expect(payloads.map((entry) => entry.name).sort()).toEqual(["nested/one.fit", "solo.fit"]);
  });

  it("counts a corrupt zip as failed", () => {
    const { payloads, failed } = expandUploads([
      { name: "broken.zip", bytes: new Uint8Array([1, 2, 3, 4]) },
    ]);
    expect(payloads).toHaveLength(0);
    expect(failed).toBe(1);
  });

  it("counts an unknown extension as failed", () => {
    const { failed } = expandUploads([{ name: "notes.txt", bytes: tinyFit }]);
    expect(failed).toBe(1);
  });

  it("truncates once the per-upload file cap is hit", () => {
    const files: Record<string, Uint8Array> = {};
    for (let i = 0; i < MAX_FIT_FILES + 5; i += 1) {
      files[`run-${i}.fit`] = tinyFit;
    }
    const archive = zipSync(files);
    const { payloads, truncated } = expandUploads([{ name: "many.zip", bytes: archive }]);
    expect(truncated).toBe(true);
    expect(payloads).toHaveLength(MAX_FIT_FILES);
  });
});
