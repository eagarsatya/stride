import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import { serverEnv } from "@/lib/env";

import * as schema from "./schema";

/**
 * Neon's HTTP driver: one round trip per statement, no connection to keep warm,
 * which suits Vercel's per-request lifecycle. It does not support interactive
 * transactions, so the sync layer relies on idempotent upserts instead.
 */
const globalForDb = globalThis as unknown as {
  db?: ReturnType<typeof createDb>;
};

function createDb() {
  const sql = neon(serverEnv().DATABASE_URL);
  return drizzle({ client: sql, schema, casing: "snake_case" });
}

// Reuse across hot reloads in development so we do not leak clients.
export const db = globalForDb.db ?? createDb();

if (process.env.NODE_ENV !== "production") {
  globalForDb.db = db;
}

export { schema };
