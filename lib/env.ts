import { z } from "zod";

/**
 * Server-only environment contract.
 *
 * Validation is lazy so that `next build` and tooling that never touches the
 * database or auth layer can run without a fully populated `.env`.
 */
const serverSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  BETTER_AUTH_SECRET: z
    .string()
    .min(16, "BETTER_AUTH_SECRET must be at least 16 characters"),
  BETTER_AUTH_URL: z.string().url("BETTER_AUTH_URL must be an absolute URL"),
  GOOGLE_CLIENT_ID: z.string().min(1, "GOOGLE_CLIENT_ID is required"),
  GOOGLE_CLIENT_SECRET: z.string().min(1, "GOOGLE_CLIENT_SECRET is required"),
  ENCRYPTION_KEY: z.string().min(1, "ENCRYPTION_KEY is required"),
  CRON_SECRET: z.string().min(1, "CRON_SECRET is required"),
});

export type ServerEnv = z.infer<typeof serverSchema>;

/**
 * Vercel does not set BETTER_AUTH_URL for us, but it does expose the
 * deployment host, so derive the origin when it has not been set explicitly.
 */
function resolveAuthUrl(): string | undefined {
  if (process.env.BETTER_AUTH_URL) return process.env.BETTER_AUTH_URL;

  const vercelHost =
    process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  if (vercelHost) return `https://${vercelHost}`;

  return undefined;
}

let cached: ServerEnv | undefined;

export function serverEnv(): ServerEnv {
  if (cached) return cached;

  const parsed = serverSchema.safeParse({
    DATABASE_URL: process.env.DATABASE_URL,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: resolveAuthUrl(),
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
    CRON_SECRET: process.env.CRON_SECRET,
  });

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Invalid environment configuration:\n${issues}\n\nCopy .env.example to .env.local and fill in the missing values.`,
    );
  }

  cached = parsed.data;
  return cached;
}
