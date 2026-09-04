import { createHash } from "node:crypto";

import { FIT_UPLOAD_PREFIX } from "./parse";

export const MATCH_WINDOW_MS = 120_000;
export const MATCH_DISTANCE_RATIO = 0.02;
export const MATCH_DISTANCE_FLOOR_M = 200;

export type FitImportCounts = {
  imported: number;
  enriched: number;
  alreadyImported: number;
  skippedNonRun: number;
  failed: number;
};

export function emptyFitImportCounts(): FitImportCounts {
  return { imported: 0, enriched: 0, alreadyImported: 0, skippedNonRun: 0, failed: 0 };
}

export function hashFitBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function uploadActivityId(hash: string): string {
  return `${FIT_UPLOAD_PREFIX}${hash}`;
}

export function isFitUploadId(icuActivityId: string): boolean {
  return icuActivityId.startsWith(FIT_UPLOAD_PREFIX);
}

export function distancesMatch(
  a: number | null | undefined,
  b: number | null | undefined,
): boolean {
  if (a == null || b == null || a <= 0 || b <= 0) return true;
  const delta = Math.abs(a - b);
  return delta <= Math.max(MATCH_DISTANCE_FLOOR_M, MATCH_DISTANCE_RATIO * Math.max(a, b));
}

export function startsMatch(a: Date, b: Date): boolean {
  return Math.abs(a.getTime() - b.getTime()) <= MATCH_WINDOW_MS;
}

export type MatchCandidate = {
  id: string;
  startDate: Date | null;
  distanceM: number | null;
};

/**
 * Same COROS run as an Intervals.icu row: start within ±2 minutes, distance
 * within 2% (or 200 m, whichever is looser). Closest start wins if several match.
 */
export function findMatchingActivity<T extends MatchCandidate>(
  candidates: T[],
  startDate: Date,
  distanceM: number | null,
): T | null {
  const matches = candidates.filter((candidate) => {
    if (!candidate.startDate) return false;
    return (
      startsMatch(candidate.startDate, startDate) && distancesMatch(candidate.distanceM, distanceM)
    );
  });

  if (matches.length === 0) return null;

  matches.sort(
    (a, b) =>
      Math.abs(a.startDate!.getTime() - startDate.getTime()) -
      Math.abs(b.startDate!.getTime() - startDate.getTime()),
  );

  return matches[0];
}

export const ENRICHABLE_KEYS = [
  "name",
  "subType",
  "timezone",
  "distanceM",
  "movingTimeS",
  "elapsedTimeS",
  "elevationGainM",
  "elevationLossM",
  "avgSpeedMs",
  "maxSpeedMs",
  "paceSPerKm",
  "avgHr",
  "maxHr",
  "avgCadence",
  "calories",
  "avgStrideM",
  "deviceName",
  "externalId",
  "hrZoneTimes",
] as const;

export type EnrichableKey = (typeof ENRICHABLE_KEYS)[number];

function isUnset(value: unknown): boolean {
  return value == null || value === "";
}

/**
 * Fill holes on an Intervals.icu row from FIT data. Never overwrites a value
 * that is already present — training load / CTL / ATL are not in this list.
 */
export function enrichPatch(
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};

  for (const key of ENRICHABLE_KEYS) {
    if (isUnset(existing[key]) && !isUnset(incoming[key])) patch[key] = incoming[key];
  }

  if (existing.hasGps !== true && incoming.hasGps === true) patch.hasGps = true;
  if (isUnset(existing.streamTypes) && !isUnset(incoming.streamTypes)) {
    patch.streamTypes = incoming.streamTypes;
  }

  return patch;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

export function describeFitImport(counts: FitImportCounts, total: number): string {
  if (total === 0) return "No .fit files found.";

  const parts: string[] = [];
  if (counts.imported) parts.push(`imported ${plural(counts.imported, "run")}`);
  if (counts.enriched) {
    parts.push(
      `filled in ${counts.enriched} already-synced ${counts.enriched === 1 ? "run" : "runs"}`,
    );
  }
  if (counts.alreadyImported) {
    parts.push(`skipped ${counts.alreadyImported} already imported`);
  }
  if (counts.skippedNonRun) parts.push(`skipped ${counts.skippedNonRun} non-run`);
  if (counts.failed) parts.push(`${counts.failed} failed`);

  if (parts.length === 0) return "Nothing to import.";

  const text = parts.join(", ");
  return text.charAt(0).toUpperCase() + text.slice(1) + ".";
}
