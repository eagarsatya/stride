import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { connections, type Connection } from "@/db/schema/app";
import { IntervalsClient } from "@/lib/intervals/client";
import { credentialFromConnection } from "@/lib/intervals/credentials";

export const INTERVALS_PROVIDER = "intervals_icu";

export async function getConnection(userId: string): Promise<Connection | null> {
  const [connection] = await db
    .select()
    .from(connections)
    .where(and(eq(connections.userId, userId), eq(connections.provider, INTERVALS_PROVIDER)))
    .limit(1);

  return connection ?? null;
}

/**
 * Build an API client scoped to a user's stored credential. The credential is
 * decrypted here and never leaves the server.
 */
export function clientForConnection(connection: Connection): IntervalsClient {
  return new IntervalsClient(credentialFromConnection(connection), connection.icuAthleteId);
}

export async function clientForUser(
  userId: string,
): Promise<{ client: IntervalsClient; connection: Connection } | null> {
  const connection = await getConnection(userId);
  if (!connection) return null;

  return { client: clientForConnection(connection), connection };
}
