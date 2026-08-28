import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import { serverEnv } from "@/lib/env";

import * as schema from "./schema";

type Database = ReturnType<typeof createDb>;

/**
 * Neon's HTTP driver: one round trip per statement and no connection to keep
 * warm, which suits Vercel's per-request lifecycle. It does not support
 * interactive transactions, so the sync layer relies on idempotent upserts.
 */
function createDb() {
  const sql = neon(serverEnv().DATABASE_URL);
  return drizzle({ client: sql, schema, casing: "snake_case" });
}

const globalForDb = globalThis as unknown as { db?: Database };

function getDb(): Database {
  // Reuse across hot reloads in development so we do not leak clients.
  globalForDb.db ??= createDb();
  return globalForDb.db;
}

/**
 * Constructed on first use rather than at import time, so that modules which
 * merely import `db` (or are pulled in by the build) do not require a populated
 * environment.
 */
export const db = new Proxy({} as Database, {
  get(_target, property, receiver) {
    const instance = getDb();
    const value = Reflect.get(instance, property, receiver);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});

export { schema };
