import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Next.js loads .env.local, plain dotenv does not, so load both for the CLI.
config({ path: [".env.local", ".env"], quiet: true });

export default defineConfig({
  schema: "./db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  casing: "snake_case",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
  strict: true,
  verbose: true,
});
