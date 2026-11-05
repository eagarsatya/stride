import { and, eq, gte, lte } from "drizzle-orm";

import { db } from "@/db";
import { activities, activityStreams, type NewActivity } from "@/db/schema/app";
import {
  describeFitImport,
  emptyFitImportCounts,
  enrichPatch,
  findMatchingActivity,
  hashFitBytes,
  MATCH_WINDOW_MS,
  uploadActivityId,
  type FitImportCounts,
} from "@/lib/fit/match";
import { FIT_SOURCE, parseFitFile, type ParsedFitActivity } from "@/lib/fit/parse";
import { expandUploads, MAX_FIT_FILES, type FitPayload } from "@/lib/fit/zip";
import { mapStreams } from "@/lib/intervals/map";
import { computeBestEfforts } from "@/lib/records";
import { isStructuredTraining, type TrainingStep } from "@/lib/training";

export { MAX_FIT_FILES, MAX_FIT_BYTES, MAX_ZIP_BYTES } from "@/lib/fit/zip";

export type FitImportOutcome = FitImportCounts & { message: string };

function toNewActivity(userId: string, hash: string, parsed: ParsedFitActivity): NewActivity {
  const { summary } = parsed;

  return {
    userId,
    icuActivityId: uploadActivityId(hash),
    source: FIT_SOURCE,
    externalId: summary.externalId,
    fitFileHash: hash,
    name: summary.name,
    type: summary.type,
    subType: summary.subType,
    startDateLocal: summary.startDateLocal,
    startDate: summary.startDate,
    timezone: summary.timezone,
    distanceM: summary.distanceM,
    movingTimeS: summary.movingTimeS,
    elapsedTimeS: summary.elapsedTimeS,
    elevationGainM: summary.elevationGainM,
    elevationLossM: summary.elevationLossM,
    avgSpeedMs: summary.avgSpeedMs,
    maxSpeedMs: summary.maxSpeedMs,
    paceSPerKm: summary.paceSPerKm,
    avgHr: summary.avgHr,
    maxHr: summary.maxHr,
    avgCadence: summary.avgCadence,
    calories: summary.calories,
    avgStrideM: summary.avgStrideM,
    hrZoneTimes: summary.hrZoneTimes,
    isTreadmill: summary.isTreadmill,
    deviceName: summary.deviceName,
    streamTypes: summary.streamTypes,
    hasGps: summary.hasGps,
    ...trainingFields(parsed.trainingSteps),
    raw: parsed.raw,
  };
}

function trainingFields(steps: TrainingStep[]): {
  trainingSteps?: TrainingStep[];
  trainingStepsAt?: Date;
} {
  if (!isStructuredTraining(steps)) return {};
  return { trainingSteps: steps, trainingStepsAt: new Date() };
}

function summaryAsRecord(parsed: ParsedFitActivity): Record<string, unknown> {
  return { ...parsed.summary };
}

async function persistStreams(
  activityId: string,
  streams: Array<{ type: string; data: unknown[] }>,
  overwriteBestEfforts: boolean,
): Promise<void> {
  if (streams.length === 0) {
    if (overwriteBestEfforts) {
      await db
        .update(activities)
        .set({ bestEfforts: {}, bestEffortsAt: new Date() })
        .where(eq(activities.id, activityId));
    }
    return;
  }

  const byType = new Map(streams.map((stream) => [stream.type, stream.data]));
  const bestEfforts = computeBestEfforts(byType.get("distance"), byType.get("time"));
  const { data, pointCount } = mapStreams(streams);

  await db
    .insert(activityStreams)
    .values({ activityId, data, pointCount })
    .onConflictDoUpdate({
      target: activityStreams.activityId,
      set: { data, pointCount, fetchedAt: new Date() },
    });

  if (overwriteBestEfforts) {
    await db
      .update(activities)
      .set({ bestEfforts, bestEffortsAt: new Date() })
      .where(eq(activities.id, activityId));
  }
}

async function alreadyHasStreams(activityId: string): Promise<boolean> {
  const [cached] = await db
    .select({ activityId: activityStreams.activityId })
    .from(activityStreams)
    .where(eq(activityStreams.activityId, activityId))
    .limit(1);

  return !!cached;
}

type StoredActivity = typeof activities.$inferSelect;

async function importOne(userId: string, file: FitPayload, counts: FitImportCounts): Promise<void> {
  const { bytes } = file;
  const hash = hashFitBytes(bytes);

  const [existingHash] = await db
    .select({ id: activities.id })
    .from(activities)
    .where(and(eq(activities.userId, userId), eq(activities.fitFileHash, hash)))
    .limit(1);

  if (existingHash) {
    counts.alreadyImported += 1;
    return;
  }

  const parsed = parseFitFile(bytes);
  if (!parsed.ok) {
    if (parsed.reason === "not-a-run") counts.skippedNonRun += 1;
    else counts.failed += 1;
    return;
  }

  const from = new Date(parsed.activity.summary.startDate.getTime() - MATCH_WINDOW_MS);
  const to = new Date(parsed.activity.summary.startDate.getTime() + MATCH_WINDOW_MS);

  const candidates = await db
    .select()
    .from(activities)
    .where(
      and(
        eq(activities.userId, userId),
        gte(activities.startDate, from),
        lte(activities.startDate, to),
      ),
    );

  const match = findMatchingActivity(
    candidates,
    parsed.activity.summary.startDate,
    parsed.activity.summary.distanceM,
  );

  if (match) {
    await enrichExisting(match, hash, parsed.activity);
    counts.enriched += 1;
    return;
  }

  const [inserted] = await db
    .insert(activities)
    .values(toNewActivity(userId, hash, parsed.activity))
    .returning({ id: activities.id });

  if (!inserted) {
    counts.failed += 1;
    return;
  }

  await persistStreams(inserted.id, parsed.activity.streams, true);
  counts.imported += 1;
}

async function enrichExisting(existing: StoredActivity, hash: string, parsed: ParsedFitActivity) {
  const patch = enrichPatch(
    existing as unknown as Record<string, unknown>,
    summaryAsRecord(parsed),
  );

  const training = existing.trainingStepsAt ? {} : trainingFields(parsed.trainingSteps);

  await db
    .update(activities)
    .set({
      ...(patch as Partial<StoredActivity>),
      ...training,
      fitFileHash: hash,
      syncedAt: new Date(),
    })
    .where(eq(activities.id, existing.id));

  if (!(await alreadyHasStreams(existing.id))) {
    await persistStreams(existing.id, parsed.streams, true);
  }
}

export async function importFitFilesForUser(
  userId: string,
  files: File[],
): Promise<FitImportOutcome> {
  const counts = emptyFitImportCounts();
  const uploads: FitPayload[] = [];

  for (const file of files) {
    uploads.push({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
  }

  const expanded = expandUploads(uploads);
  counts.failed += expanded.failed;

  for (const payload of expanded.payloads) {
    try {
      await importOne(userId, payload, counts);
    } catch {
      counts.failed += 1;
    }
  }

  let message = describeFitImport(counts, expanded.payloads.length);
  if (expanded.truncated) {
    message = `${message} Stopped at ${MAX_FIT_FILES} files — zip the rest and import again.`;
  }

  return { ...counts, message };
}
