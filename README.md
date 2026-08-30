# Stride — Running Dashboard

A multi-user running dashboard that pulls your COROS activities into your own
Postgres database through Intervals.icu, then visualizes volume, pace, heart
rate, training load, and personal records.

## Why the data flows this way

COROS has no public API — access is partner-application only. Intervals.icu is
free, has a documented REST API, and syncs with COROS **directly**. That last
detail matters: Strava-sourced activities cannot be re-exposed through the
Intervals API, and Strava now requires a paid subscription for API access.

```
COROS watch → COROS Cloud → Intervals.icu → sync worker (Vercel) → Neon Postgres → dashboard
```

Each user connects their own Intervals.icu account with a personal API key.
Intervals.icu does not offer self-serve OAuth client registration, so the key is
pasted once and encrypted at rest. The `connections` table already has columns
for OAuth tokens, so adding a "Connect with Intervals.icu" button later is an
additive change rather than a migration.

## Stack

| Concern    | Choice                                           |
| ---------- | ------------------------------------------------ |
| Framework  | Next.js 16 (App Router), React 19, TypeScript    |
| Styling    | Tailwind CSS 4, shadcn/ui                        |
| Auth       | Better Auth with Google sign-in                  |
| Database   | Neon serverless Postgres, Drizzle ORM            |
| Charts     | Recharts, MapLibre GL for route maps             |
| Validation | Zod on every Intervals.icu response              |
| Hosting    | Vercel, nightly sync via Vercel Cron             |

---

## Setup

### 0. Prerequisites

- Node.js 22 or newer
- A COROS account, already linked inside Intervals.icu (see step 4)

```bash
npm install
cp .env.example .env.local
```

### 1. Create the database (Neon)

1. Sign up at [console.neon.tech](https://console.neon.tech) — the free tier is
   enough for this.
2. Create a project. Any region close to you is fine.
3. On the project dashboard, copy the **pooled** connection string. It looks
   like:
   `postgresql://user:pass@ep-something-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require`
4. Put it in `.env.local` as `DATABASE_URL`.

> Use the pooled (`-pooler`) host. It is the one suited to serverless functions.

Then create the tables:

```bash
npm run db:migrate
```

You should see the nine tables created. `npm run db:studio` opens a browser UI
if you want to poke at the data later.

### 2. Generate the secrets

Three secrets are needed. On macOS/Linux:

```bash
openssl rand -base64 32   # BETTER_AUTH_SECRET
openssl rand -base64 32   # ENCRYPTION_KEY  (must decode to exactly 32 bytes)
openssl rand -hex 32      # CRON_SECRET
```

On Windows PowerShell:

```powershell
node -e "const c=require('crypto');console.log('AUTH  ='+c.randomBytes(32).toString('base64'));console.log('ENC   ='+c.randomBytes(32).toString('base64'));console.log('CRON  ='+c.randomBytes(32).toString('hex'))"
```

`ENCRYPTION_KEY` protects every stored Intervals.icu API key. **Changing it makes
all stored credentials undecryptable** — users would have to reconnect.

### 3. Create the Google OAuth client

1. Open [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials).
2. Create a project if you do not have one.
3. Configure the **OAuth consent screen**: External, add your own email as a test
   user. You do not need Google verification for personal use.
4. **Create Credentials → OAuth client ID → Web application.**
5. Add these **Authorized redirect URIs**:
   - `http://localhost:3000/api/auth/callback/google`
   - `https://your-domain.vercel.app/api/auth/callback/google` (add after deploying)
6. Copy the client ID and secret into `GOOGLE_CLIENT_ID` and
   `GOOGLE_CLIENT_SECRET`.

### 4. Link COROS inside Intervals.icu

This is the part that actually gets your watch data moving, and it is done in
Intervals.icu, not here.

1. Sign in at [intervals.icu](https://intervals.icu).
2. **Settings → Connections → COROS → Connect.** Authorize from the Intervals
   side, not from the COROS app.
3. **Do not also connect Strava.** If both are connected you will get duplicate
   activities, and Strava-sourced activities are not readable through the API.
4. Wait for the initial COROS import to finish. How far back it reaches depends
   on your COROS account; Stride detects the true oldest activity rather than
   assuming a range.

### 5. Get your Intervals.icu API key

**Settings → Developer Settings → API key.** Copy it. You will paste it into
Stride's connections page after signing in — not into `.env`.

### 6. Run it

```bash
npm run dev
```

Open <http://localhost:3000>, sign in with Google, then go to
**Settings → Connections** and paste your API key. Stride verifies the key,
resolves your athlete id, syncs the last 90 days immediately, and offers a
three-year backfill.

---

## Deploying to Vercel

1. Push the repository to GitHub.
2. In Vercel, **Add New → Project** and import it. The framework is detected
   automatically; no build settings to change.
3. Add these environment variables (Production **and** Preview):

   | Variable               | Value                                            |
   | ---------------------- | ------------------------------------------------ |
   | `DATABASE_URL`         | Neon pooled connection string                    |
   | `BETTER_AUTH_SECRET`   | from step 2                                      |
   | `BETTER_AUTH_URL`      | `https://your-domain.vercel.app` (no trailing /) |
   | `GOOGLE_CLIENT_ID`     | from step 3                                      |
   | `GOOGLE_CLIENT_SECRET` | from step 3                                      |
   | `ENCRYPTION_KEY`       | from step 2 — must match whatever encrypted the stored keys |
   | `CRON_SECRET`          | from step 2                                      |

   `BETTER_AUTH_URL` is optional on Vercel — it falls back to the deployment
   host — but setting it explicitly avoids surprises on preview URLs.

4. Add the production redirect URI to your Google OAuth client:
   `https://your-domain.vercel.app/api/auth/callback/google`
5. Deploy. Run `npm run db:migrate` locally against the same `DATABASE_URL` (or
   use Neon's SQL editor with `drizzle/0000_init.sql`) if you have not already.
6. The cron schedule in `vercel.json` registers itself on deploy:
   `/api/cron/sync` daily at 03:00 UTC. Vercel signs the request with
   `CRON_SECRET` automatically.

Test the cron route by hand:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://your-domain.vercel.app/api/cron/sync
```

### Plan limits worth knowing

- **Hobby** allows one cron invocation per day and caps functions at 60 seconds.
  The three-year backfill is resumable, so if it times out just click it again —
  already-synced runs are skipped by the upsert.
- **Pro** allows finer cron schedules and the 300-second `maxDuration` the
  backfill and best-effort analysis routes ask for.

---

## How syncing works

| Trigger              | Range                          | Notes                                        |
| -------------------- | ------------------------------ | -------------------------------------------- |
| Connect              | Last 90 days                   | So the dashboard is not empty on arrival     |
| "Sync now"           | Since last sync − 7 days       | Throttled to once a minute per user          |
| "Backfill 3 years"   | 3 years in 6-month windows     | Progress written to `sync_jobs`, resumable   |
| Nightly cron         | Since last sync − 7 days       | Every connected account                      |

The seven-day overlap exists because activities get edited retroactively and
COROS sometimes uploads late. Every write is an upsert keyed on
`(user_id, icu_activity_id)`, so re-syncing the same range is harmless.

Only `Run`, `TrailRun`, and `VirtualRun` are ingested. The untouched API payload
is kept in a `raw` jsonb column, so new charts can be built from fields that are
not yet promoted to typed columns without re-syncing anything.

Streams (heart rate, pace, GPS, altitude) are fetched lazily the first time you
open an activity, then cached. They are downsampled to ~1000 points for storage,
but personal-record best efforts are computed from the full-resolution stream
first — a downsampled stream would quantise split boundaries and report times
that were never actually run.

## Personal records

Distance records need one pass over each run's streams, which is one API request
per run. The **Records** page shows an "Analyze N runs" button that works through
the backlog in batches, rate-limited, and is safe to stop and resume. Analyzing
a run also warms its detail page.

## Security notes

- Intervals.icu API keys are long-lived and grant full access to a user's
  account, so they are encrypted with AES-256-GCM before being written. They are
  never returned to the browser and never logged.
- The proxy (`proxy.ts`) only checks for the presence of a session cookie, which
  is a cheap optimistic redirect. Every page and server action independently
  calls `requireUser()` for the real check.
- The cron route compares `CRON_SECRET` in constant time.

## Scripts

| Command               | What it does                                    |
| --------------------- | ----------------------------------------------- |
| `npm run dev`         | Dev server                                      |
| `npm run build`       | Production build                                |
| `npm test`            | Unit tests (Vitest)                             |
| `npm run typecheck`   | `tsc --noEmit`                                  |
| `npm run lint`        | ESLint                                          |
| `npm run format`      | Prettier                                        |
| `npm run db:generate` | Generate a migration from schema changes        |
| `npm run db:migrate`  | Apply migrations                                |
| `npm run db:studio`   | Drizzle Studio                                  |

There is also a spec explorer for extending the API client, since Intervals.icu's
field names are only loosely documented elsewhere:

```bash
node scripts/icu-spec.mjs paths wellness
node scripts/icu-spec.mjs endpoint "/api/v1/athlete/{id}/activities"
node scripts/icu-spec.mjs schema Activity
```

## Project layout

```
app/
  (app)/              authenticated pages, shared nav shell
    dashboard/        overview: totals, streak, volume, fitness curve
    activities/       filterable table + per-activity detail
    trends/           monthly volume, pace vs HR, decoupling, zones
    records/          personal records, milestones, races
    settings/         connections, sync controls, danger zone
  api/auth/           Better Auth handler
  api/cron/sync/      nightly sync, CRON_SECRET protected
db/schema/            Drizzle tables (auth.ts is Better Auth's, app.ts is ours)
lib/
  intervals/          typed API client, Zod schemas, mappers, rate limiter
  crypto.ts           AES-256-GCM seal/open for credentials
  sync.ts             backfill, incremental sync, stream caching
  queries.ts          dashboard and activity queries
  analytics.ts        trends and records queries
  records.ts          best-effort computation from streams
  splits.ts           per-km splits, chart series, route line
```

## Known limits

- **Only your own data.** Intervals.icu never exposes other athletes'
  activities, so every user must connect their own account. That is inherent to
  the platform.
- **COROS-only metrics stay behind.** EvoLab, recovery percentage, and effort
  score generally do not cross the partner sync. GPS, heart rate, pace, cadence,
  and laps do.
- **History depth varies.** Intervals may only hold recent history depending on
  how the COROS link was set up.
- Running cadence is stored exactly as Intervals.icu reports it; some devices
  report single-leg cadence, so compare against the Intervals.icu UI if a number
  looks half what you expect.
