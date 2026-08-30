"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { activities, connections, wellness } from "@/db/schema/app";
import type { ActionState } from "@/lib/action-state";
import { INTERVALS_PROVIDER, getConnection } from "@/lib/connections";
import { seal } from "@/lib/crypto";
import { IntervalsClient } from "@/lib/intervals/client";
import { describeIntervalsError } from "@/lib/intervals/errors";
import { requireUser } from "@/lib/session";
import { NotConnectedError, SyncBusyError, runSync } from "@/lib/sync";

/**
 * Intervals.icu keys are short lowercase alphanumeric strings. The bounds are
 * deliberately loose so a future format change does not lock users out.
 */
const apiKeySchema = z
  .string()
  .trim()
  .min(10, "That key looks too short.")
  .max(200, "That key looks too long.")
  .regex(/^[A-Za-z0-9._-]+$/, "That does not look like an Intervals.icu API key.");

function revalidateAll() {
  revalidatePath("/settings/connections");
  revalidatePath("/dashboard");
  revalidatePath("/activities");
  revalidatePath("/trends");
  revalidatePath("/records");
}

export async function connectIntervals(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();

  const parsed = apiKeySchema.safeParse(formData.get("apiKey") ?? "");
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0].message };
  }

  const apiKey = parsed.data;

  // Prove the key works, and learn which athlete it belongs to, before storing
  // anything. "0" is the only athlete id valid for an unknown athlete.
  let athlete: { id: string; name: string | null };
  try {
    athlete = await new IntervalsClient({ kind: "apiKey", apiKey }).profile();
  } catch (error) {
    return { status: "error", message: describeIntervalsError(error) };
  }

  const sealed = seal(apiKey);

  await db
    .insert(connections)
    .values({
      userId: user.id,
      provider: INTERVALS_PROVIDER,
      icuAthleteId: athlete.id,
      icuAthleteName: athlete.name,
      apiKeyCipher: sealed.cipher,
      apiKeyIv: sealed.iv,
      apiKeyTag: sealed.tag,
      // Clear any OAuth credential so the two cannot disagree.
      accessToken: null,
      refreshToken: null,
      tokenExpiresAt: null,
      scopes: null,
    })
    .onConflictDoUpdate({
      target: [connections.userId, connections.provider],
      set: {
        icuAthleteId: athlete.id,
        icuAthleteName: athlete.name,
        apiKeyCipher: sealed.cipher,
        apiKeyIv: sealed.iv,
        apiKeyTag: sealed.tag,
        accessToken: null,
        refreshToken: null,
        tokenExpiresAt: null,
        scopes: null,
        lastSyncStatus: null,
        lastSyncError: null,
        updatedAt: new Date(),
      },
    });

  revalidateAll();

  // Pull a first slice immediately so the dashboard is not empty on arrival.
  try {
    const result = await runSync({ userId: user.id, kind: "incremental" });
    revalidateAll();

    return {
      status: "success",
      message:
        result.activitiesUpserted > 0
          ? `Connected as ${athlete.name ?? athlete.id}. Synced ${result.activitiesUpserted} recent runs.`
          : `Connected as ${athlete.name ?? athlete.id}. No runs found in the last 90 days — try a full backfill.`,
    };
  } catch (error) {
    return {
      status: "error",
      message: `Connected as ${athlete.name ?? athlete.id}, but the first sync failed: ${describeIntervalsError(error)}`,
    };
  }
}

export async function disconnectIntervals(): Promise<ActionState> {
  const user = await requireUser();

  // Only the credential is removed; already-synced runs stay so that
  // disconnecting is not destructive.
  await db
    .delete(connections)
    .where(
      and(eq(connections.userId, user.id), eq(connections.provider, INTERVALS_PROVIDER)),
    );

  revalidateAll();
  return { status: "success", message: "Disconnected. Your synced runs were kept." };
}

export async function deleteAllData(): Promise<ActionState> {
  const user = await requireUser();

  // activity_streams has an ON DELETE CASCADE from activities, so removing the
  // activities is enough -- and keeps the delete scoped to this user.
  await db.delete(activities).where(eq(activities.userId, user.id));
  await db.delete(wellness).where(eq(wellness.userId, user.id));

  revalidateAll();
  return { status: "success", message: "All synced activity data deleted." };
}

async function sync(kind: "manual" | "backfill"): Promise<ActionState> {
  const user = await requireUser();

  if (!(await getConnection(user.id))) {
    return { status: "error", message: "Connect Intervals.icu first." };
  }

  try {
    const result = await runSync({ userId: user.id, kind });
    revalidateAll();

    return {
      status: "success",
      message: `Synced ${result.activitiesUpserted} runs${
        result.skipped > 0 ? ` (${result.skipped} rows skipped)` : ""
      }.`,
    };
  } catch (error) {
    if (error instanceof SyncBusyError) {
      return { status: "error", message: error.message };
    }
    if (error instanceof NotConnectedError) {
      return { status: "error", message: "Connect Intervals.icu first." };
    }
    return { status: "error", message: describeIntervalsError(error) };
  }
}

export async function syncNow(): Promise<ActionState> {
  return sync("manual");
}

export async function backfillHistory(): Promise<ActionState> {
  return sync("backfill");
}
