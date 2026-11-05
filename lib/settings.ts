import { cache } from "react";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { userSettings } from "@/db/schema/app";
import type { DistanceUnit } from "@/lib/units";

/**
 * One row per request. Missing settings mean the user has never toggled, so km.
 */
export const getDistanceUnit = cache(async (userId: string): Promise<DistanceUnit> => {
  const [row] = await db
    .select({ distanceUnit: userSettings.distanceUnit })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);

  return row?.distanceUnit ?? "km";
});
