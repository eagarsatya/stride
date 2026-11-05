export const DISTANCE_UNITS = ["km", "mi"] as const;
export type DistanceUnit = (typeof DISTANCE_UNITS)[number];

export const METRES_PER_MILE = 1609.344;
export const FEET_PER_METRE = 3.28084;

export function isDistanceUnit(value: unknown): value is DistanceUnit {
  return value === "km" || value === "mi";
}

export function splitMetresFor(unit: DistanceUnit): number {
  return unit === "mi" ? METRES_PER_MILE : 1000;
}

/** Convert stored seconds-per-km into the display unit's seconds-per-distance. */
export function paceToUnit(secondsPerKm: number, unit: DistanceUnit): number {
  return unit === "mi" ? secondsPerKm * (METRES_PER_MILE / 1000) : secondsPerKm;
}

/** Metres → km or miles. */
export function metresToUnit(metres: number, unit: DistanceUnit): number {
  return unit === "mi" ? metres / METRES_PER_MILE : metres / 1000;
}

/** Chart series that are already in kilometres. */
export function kmToUnit(km: number, unit: DistanceUnit): number {
  return unit === "mi" ? km / (METRES_PER_MILE / 1000) : km;
}

export function distanceSuffix(unit: DistanceUnit): string {
  return unit === "mi" ? "mi" : "km";
}

export function paceSuffix(unit: DistanceUnit): string {
  return unit === "mi" ? "/mi" : "/km";
}

export function splitColumnLabel(unit: DistanceUnit): string {
  return unit === "mi" ? "Mi" : "Km";
}
