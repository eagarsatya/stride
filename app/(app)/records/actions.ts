"use server";

import { revalidatePath } from "next/cache";

import { getConnection } from "@/lib/connections";
import { describeIntervalsError } from "@/lib/intervals/errors";
import { requireUser } from "@/lib/session";
import { analyzeBestEfforts } from "@/lib/sync";

export type AnalyzeState = {
  status: "success" | "error";
  analyzed: number;
  remaining: number;
  message?: string;
};

/**
 * Analyze one batch of runs. Each run needs its own streams request, so the
 * work is chunked and the client re-invokes this until `remaining` is zero.
 */
export async function analyzeRuns(): Promise<AnalyzeState> {
  const user = await requireUser();

  if (!(await getConnection(user.id))) {
    return {
      status: "error",
      analyzed: 0,
      remaining: 0,
      message: "Connect Intervals.icu first.",
    };
  }

  try {
    const { analyzed, remaining } = await analyzeBestEfforts(user.id, 20);

    revalidatePath("/records");
    revalidatePath("/activities");

    return { status: "success", analyzed, remaining };
  } catch (error) {
    return {
      status: "error",
      analyzed: 0,
      remaining: 0,
      message: describeIntervalsError(error),
    };
  }
}
