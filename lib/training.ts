import type { TrainingStep } from "@/db/schema/app";

import { speedToPace } from "@/lib/intervals/map";
import type { IntervalsInterval } from "@/lib/intervals/schemas";

export type { TrainingStep };

export type IntervalGroupLike = {
  id?: number | null;
  label?: string | null;
};

export type FitLapLike = {
  totalDistance?: number;
  totalElapsedTime?: number;
  totalTimerTime?: number;
  totalMovingTime?: number;
  avgSpeed?: number;
  enhancedAvgSpeed?: number;
  avgHeartRate?: number;
  maxHeartRate?: number;
  intensity?: string | number;
  lapTrigger?: string | number;
};

const WORKOUT_TYPES = new Set([
  "work",
  "rest",
  "warmup",
  "warm_up",
  "cooldown",
  "cool_down",
  "recovery",
  "interval",
]);

const REST_TYPES = new Set(["rest", "recovery"]);

const TYPE_LABELS: Record<string, string> = {
  work: "Work",
  rest: "Rest",
  warmup: "Warm up",
  warm_up: "Warm up",
  cooldown: "Cool down",
  cool_down: "Cool down",
  recovery: "Recovery",
  interval: "Work",
  active: "Active",
  lap: "Lap",
};

const FIT_INTENSITY: Record<number, string> = {
  0: "active",
  1: "rest",
  2: "warmup",
  3: "cooldown",
  4: "recovery",
  5: "interval",
  6: "other",
};

const AUTO_LAP_METRES = [1000, 1609.34];

export function normalizeStepType(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return normalized || null;
}

export function isWorkoutType(value: string | null | undefined): boolean {
  const type = normalizeStepType(value);
  return type != null && WORKOUT_TYPES.has(type);
}

export function isRestStep(value: string | null | undefined): boolean {
  const type = normalizeStepType(value);
  return type != null && REST_TYPES.has(type);
}

export function formatStepType(value: string | null | undefined): string | null {
  const type = normalizeStepType(value);
  if (!type) return null;
  return TYPE_LABELS[type] ?? value!.trim();
}

function isAutoLapDistance(metres: number | null | undefined): boolean {
  if (metres == null || metres <= 0) return false;
  return AUTO_LAP_METRES.some((target) => Math.abs(metres - target) / target <= 0.08);
}

/**
 * True when the steps are a workout (or irregular laps), not even-kilometre
 * autolaps. Easy runs keep a single Per km tab.
 */
export function isStructuredTraining(steps: TrainingStep[]): boolean {
  if (steps.length < 2) return false;
  if (steps.some((step) => isWorkoutType(step.type))) return true;

  const distances = steps
    .map((step) => step.distanceM)
    .filter((metres): metres is number => metres != null && metres > 0);

  if (distances.length < 2) return steps.length >= 3;

  // The last split is often a partial leftover, so only the body has to look
  // like autolap for us to hide the Training tab.
  const body = distances.slice(0, -1);
  if (body.length === 0) return false;
  return body.some((metres) => !isAutoLapDistance(metres));
}

function reindex(steps: TrainingStep[]): TrainingStep[] {
  return steps.map((step, index) => ({ ...step, index: index + 1 }));
}

/**
 * Intervals.icu sometimes prepends one interval covering the whole activity.
 * Drop it when it is just the sum of the other steps.
 */
export function dropWholeActivityInterval<T extends { distance?: number | null }>(
  intervals: T[],
): T[] {
  if (intervals.length < 3) return intervals;

  return intervals.filter((interval, index) => {
    const distance = interval.distance;
    if (distance == null || distance <= 0) return true;

    const others = intervals.filter((_, otherIndex) => otherIndex !== index);
    if (others.length < 2) return true;

    const otherSum = others.reduce((sum, item) => sum + (item.distance ?? 0), 0);
    if (otherSum <= 0) return true;

    return Math.abs(distance - otherSum) / otherSum > 0.08;
  });
}

/**
 * When workout-typed steps are present, drop even-km autolaps that the watch
 * also recorded. 1 km work reps stay, because their type is Work.
 */
export function pruneAutolaps(steps: TrainingStep[]): TrainingStep[] {
  if (!steps.some((step) => isWorkoutType(step.type))) return steps;

  const kept = steps.filter(
    (step) => isWorkoutType(step.type) || !isAutoLapDistance(step.distanceM),
  );
  return kept.length >= 2 ? kept : steps;
}

function toInt(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : null;
}

function toFinite(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function paceFrom(options: {
  speedMs?: number | null;
  pace?: number | null;
  distanceM?: number | null;
  elapsedS?: number | null;
}): number | null {
  const fromSpeed = speedToPace(options.speedMs);
  if (fromSpeed != null) return fromSpeed;

  const pace = toFinite(options.pace);
  if (pace != null && pace > 50) return pace > 3000 ? null : pace;
  const fromPaceField = speedToPace(pace);
  if (fromPaceField != null) return fromPaceField;

  const distanceM = toFinite(options.distanceM);
  const elapsedS = toFinite(options.elapsedS);
  if (distanceM != null && distanceM > 0 && elapsedS != null && elapsedS > 0) {
    const computed = (elapsedS / distanceM) * 1000;
    return computed > 3000 ? null : computed;
  }

  return null;
}

function mapIntensity(value: string | number | undefined): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return FIT_INTENSITY[value] ?? null;
  }
  if (typeof value === "string") return normalizeStepType(value);
  return null;
}

export function mapIcuIntervals(
  intervals: IntervalsInterval[] | null | undefined,
  groups: IntervalGroupLike[] | null | undefined = [],
): TrainingStep[] {
  if (!intervals || intervals.length === 0) return [];

  const groupById = new Map<number, string>();
  for (const group of groups ?? []) {
    if (group.id != null && group.label) groupById.set(group.id, group.label);
  }

  const usable = dropWholeActivityInterval(intervals);
  const steps: TrainingStep[] = [];

  for (const interval of usable) {
    const distanceM = toFinite(interval.distance);
    const elapsedS = toInt(interval.moving_time) ?? toInt(interval.elapsed_time);
    if ((distanceM == null || distanceM <= 0) && (elapsedS == null || elapsedS <= 0)) continue;

    const type = normalizeStepType(interval.type);
    const groupId = toFinite(interval.group_id);

    steps.push({
      index: steps.length + 1,
      label: interval.label?.trim() || null,
      type: type === "other" ? null : type,
      groupLabel: groupId != null ? (groupById.get(groupId) ?? null) : null,
      distanceM,
      elapsedS,
      paceSPerKm: paceFrom({
        speedMs: interval.average_speed,
        pace: interval.average_pace,
        distanceM,
        elapsedS,
      }),
      avgHr: toInt(interval.average_heartrate),
      maxHr: toInt(interval.max_heartrate),
    });
  }

  return reindex(pruneAutolaps(steps));
}

export function mapFitLaps(laps: FitLapLike[] | null | undefined): TrainingStep[] {
  if (!laps || laps.length === 0) return [];

  const steps: TrainingStep[] = [];

  for (const lap of laps) {
    const distanceM = toFinite(lap.totalDistance);
    const elapsedS =
      toInt(lap.totalTimerTime) ?? toInt(lap.totalMovingTime) ?? toInt(lap.totalElapsedTime);
    if ((distanceM == null || distanceM <= 0) && (elapsedS == null || elapsedS <= 0)) continue;

    const intensity = mapIntensity(lap.intensity);
    const type =
      intensity && intensity !== "active" && intensity !== "other" ? intensity : null;

    steps.push({
      index: steps.length + 1,
      label: null,
      type,
      groupLabel: null,
      distanceM,
      elapsedS,
      paceSPerKm: paceFrom({
        speedMs: toFinite(lap.enhancedAvgSpeed) ?? toFinite(lap.avgSpeed),
        distanceM,
        elapsedS,
      }),
      avgHr: toInt(lap.avgHeartRate),
      maxHr: toInt(lap.maxHeartRate),
    });
  }

  return reindex(pruneAutolaps(steps));
}
