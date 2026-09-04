import { CheckCircle2, CircleAlert, ExternalLink, Info } from "lucide-react";
import { desc, eq, sql } from "drizzle-orm";

import { ConnectIntervalsForm } from "@/components/connect-intervals-form";
import { FitImportForm } from "@/components/fit-import-form";
import { PageHeader } from "@/components/page-header";
import { DangerControls, SyncControls } from "@/components/sync-controls";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { db } from "@/db";
import { activities, syncJobs } from "@/db/schema/app";
import { getConnection } from "@/lib/connections";
import { formatDate, formatKm, formatRelative } from "@/lib/format";
import { requireUser } from "@/lib/session";

import {
  backfillHistory,
  deleteAllData,
  disconnectIntervals,
  importFitFiles,
  syncNow,
} from "./actions";

export const metadata = { title: "Connections" };

/**
 * A three-year backfill runs inside a server action on this segment, so it needs
 * more than the default budget. Vercel's Hobby plan caps this at 60s; the
 * backfill is resumable, so a timeout just means clicking it again.
 */
export const maxDuration = 300;

export default async function ConnectionsPage() {
  const user = await requireUser();
  const connection = await getConnection(user.id);

  const [stats] = await db
    .select({
      count: sql<number>`count(*)::int`,
      totalDistance: sql<number>`coalesce(sum(${activities.distanceM}), 0)::float8`,
      oldest: sql<string | null>`min(${activities.startDateLocal})`,
      newest: sql<string | null>`max(${activities.startDateLocal})`,
    })
    .from(activities)
    .where(eq(activities.userId, user.id));

  const jobs = await db
    .select()
    .from(syncJobs)
    .where(eq(syncJobs.userId, user.id))
    .orderBy(desc(syncJobs.startedAt))
    .limit(5);

  return (
    <>
      <PageHeader
        title="Connections"
        description="Link Intervals.icu so Stride can pull your COROS runs, or import .fit files directly."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle>Intervals.icu</CardTitle>
                  <CardDescription>
                    {connection
                      ? `Connected as ${connection.icuAthleteName ?? connection.icuAthleteId} (${connection.icuAthleteId})`
                      : "Not connected"}
                  </CardDescription>
                </div>
                {connection ? (
                  <Badge variant="secondary" className="shrink-0 gap-1">
                    <CheckCircle2 className="size-3" />
                    Connected
                  </Badge>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {connection?.lastSyncStatus === "error" && connection.lastSyncError ? (
                <Alert variant="destructive">
                  <CircleAlert />
                  <AlertTitle>Last sync failed</AlertTitle>
                  <AlertDescription>{connection.lastSyncError}</AlertDescription>
                </Alert>
              ) : null}

              <ConnectIntervalsForm connected={!!connection} />

              {connection ? (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
                      <span>
                        Last sync:{" "}
                        <span className="text-foreground">
                          {formatRelative(connection.lastSyncAt)}
                        </span>
                      </span>
                      <span>
                        Runs stored: <span className="text-foreground">{stats?.count ?? 0}</span>
                      </span>
                      <span>
                        Total distance:{" "}
                        <span className="text-foreground">
                          {formatKm(stats?.totalDistance ?? 0, 0)}
                        </span>
                      </span>
                    </div>
                    <SyncControls onSyncNow={syncNow} onBackfill={backfillHistory} />
                    <p className="text-xs text-muted-foreground">
                      A nightly job keeps this current. Backfill walks three years of history in
                      six-month windows and is safe to re-run.
                    </p>
                  </div>
                </>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>COROS FIT import</CardTitle>
              <CardDescription>
                Zip a folder of COROS .fit exports and upload it in one go. Matching runs already
                synced from Intervals.icu are enriched instead of duplicated.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FitImportForm importFitFiles={importFitFiles} />
            </CardContent>
          </Card>

          {jobs.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Recent syncs</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {jobs.map((job) => (
                  <div
                    key={job.id}
                    className="flex flex-wrap items-center justify-between gap-2 text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          job.status === "error"
                            ? "destructive"
                            : job.status === "success"
                              ? "secondary"
                              : "outline"
                        }
                      >
                        {job.status}
                      </Badge>
                      <span className="text-muted-foreground">{job.kind}</span>
                    </div>
                    <div className="flex items-center gap-4 text-muted-foreground">
                      <span>{job.activitiesUpserted} runs</span>
                      <span>
                        {job.windowsDone}/{job.windowsTotal} windows
                      </span>
                      <span>{formatRelative(job.startedAt)}</span>
                    </div>
                    {job.error ? (
                      <p className="w-full text-xs text-destructive">{job.error}</p>
                    ) : null}
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}

          {connection ? (
            <Card>
              <CardHeader>
                <CardTitle>Danger zone</CardTitle>
                <CardDescription>
                  Disconnecting removes the stored key but keeps your synced runs.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <DangerControls onDisconnect={disconnectIntervals} onDeleteAll={deleteAllData} />
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Before you connect</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-muted-foreground">
              <div>
                <p className="font-medium text-foreground">1. Link COROS to Intervals.icu</p>
                <p className="mt-1">
                  In Intervals.icu open Settings → Connections and authorize COROS. Start from
                  Intervals, not from the COROS app.
                </p>
              </div>
              <div>
                <p className="font-medium text-foreground">2. Skip the Strava link</p>
                <p className="mt-1">
                  If both COROS and Strava are connected you will get duplicate activities, and
                  Strava-sourced data cannot be read back through the API.
                </p>
              </div>
              <div>
                <p className="font-medium text-foreground">3. Create an API key</p>
                <p className="mt-1">Settings → Developer Settings → API key. Paste it here.</p>
              </div>
              <div>
                <p className="font-medium text-foreground">4. Or import a FIT zip</p>
                <p className="mt-1">
                  Export activities as .fit from the COROS app, zip the folder, and upload it here.
                  Use this for runs Intervals.icu missed, or to add GPS streams to a synced run.
                </p>
              </div>
              <a
                href="https://intervals.icu/settings"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-foreground underline underline-offset-4"
              >
                Open Intervals.icu settings
                <ExternalLink className="size-3" />
              </a>
            </CardContent>
          </Card>

          {stats && stats.count > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Stored history</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm text-muted-foreground">
                <p>
                  Oldest run: <span className="text-foreground">{formatDate(stats.oldest)}</span>
                </p>
                <p>
                  Newest run: <span className="text-foreground">{formatDate(stats.newest)}</span>
                </p>
              </CardContent>
            </Card>
          ) : null}

          <Alert>
            <Info />
            <AlertTitle>Multi-user, without OAuth</AlertTitle>
            <AlertDescription>
              Intervals.icu does not offer self-serve OAuth clients, so every user connects with
              their own API key. The database already stores OAuth tokens, so a &quot;Connect with
              Intervals.icu&quot; button can be added later without a migration.
            </AlertDescription>
          </Alert>
        </div>
      </div>
    </>
  );
}
