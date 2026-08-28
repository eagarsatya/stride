import { NextResponse, type NextRequest } from "next/server";

import { db } from "@/db";
import { connections } from "@/db/schema/app";
import { secretsMatch } from "@/lib/crypto";
import { serverEnv } from "@/lib/env";
import { describeIntervalsError } from "@/lib/intervals/errors";
import { SyncBusyError, runSync } from "@/lib/sync";

/** Backfills are user-triggered; this only ever does a short incremental pull. */
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Nightly incremental sync for every connected account.
 *
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET`, which is compared in
 * constant time. One user's failure must not stop the rest, so errors are
 * collected rather than thrown.
 */
export async function GET(request: NextRequest) {
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";

  if (!secretsMatch(provided, serverEnv().CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const linked = await db.select({ userId: connections.userId }).from(connections);

  const results: Array<{
    userId: string;
    status: "success" | "skipped" | "error";
    activities?: number;
    message?: string;
  }> = [];

  for (const { userId } of linked) {
    try {
      const outcome = await runSync({ userId, kind: "incremental" });
      results.push({
        userId,
        status: "success",
        activities: outcome.activitiesUpserted,
      });
    } catch (error) {
      if (error instanceof SyncBusyError) {
        results.push({ userId, status: "skipped", message: error.message });
        continue;
      }

      console.error(`[cron/sync] user ${userId} failed`, error);
      results.push({
        userId,
        status: "error",
        message: describeIntervalsError(error),
      });
    }
  }

  return NextResponse.json({
    ranAt: new Date().toISOString(),
    accounts: linked.length,
    synced: results.filter((r) => r.status === "success").length,
    failed: results.filter((r) => r.status === "error").length,
    results,
  });
}
