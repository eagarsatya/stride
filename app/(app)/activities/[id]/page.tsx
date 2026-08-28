import { ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PaceHrChart } from "@/components/charts/pace-hr-chart";
import { PageHeader } from "@/components/page-header";
import { RouteMap } from "@/components/route-map";
import { SplitsTable } from "@/components/splits-table";
import { ZoneBars } from "@/components/zone-bars";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  EM_DASH,
  formatDateTime,
  formatDecimal,
  formatDuration,
  formatElevation,
  formatInteger,
  formatKm,
  formatPaceWithUnit,
} from "@/lib/format";
import { getActivityDetail, getActivityNeighbours } from "@/lib/queries";
import { requireUser } from "@/lib/session";
import { boundsOf, buildSeries, computeSplits, toRouteLine } from "@/lib/splits";
import { ensureStreams } from "@/lib/sync";

/** Streams are fetched from Intervals.icu on first view, then cached. */
export const maxDuration = 60;

export async function generateMetadata({ params }: PageProps<"/activities/[id]">) {
  const { id } = await params;
  const user = await requireUser();
  const activity = await getActivityDetail(user.id, id);

  return { title: activity?.name?.trim() || "Activity" };
}

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div>
      <p className="text-muted-foreground text-xs font-medium">{label}</p>
      <p className="mt-0.5 font-mono text-lg font-semibold tabular-nums">{value}</p>
      {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
    </div>
  );
}

export default async function ActivityDetailPage({ params }: PageProps<"/activities/[id]">) {
  const { id } = await params;
  const user = await requireUser();

  const activity = await getActivityDetail(user.id, id);
  if (!activity) notFound();

  const neighbours = await getActivityNeighbours(user.id, activity.startDateLocal);

  // A stream fetch failure must not take the whole page down -- the summary
  // metrics below come from the already-synced row.
  let streams: Record<string, unknown[]> | null = null;
  let streamError: string | null = null;
  try {
    streams = await ensureStreams(user.id, activity.id);
  } catch {
    streamError = "Could not load detailed streams for this activity.";
  }

  const splits = computeSplits(streams?.distance, streams?.time, streams?.heartrate);
  const series = buildSeries(streams);
  const line = toRouteLine(streams);
  const bounds = boundsOf(line);

  const typeLabel =
    activity.type === "TrailRun" ? "Trail" : activity.type === "VirtualRun" ? "Virtual" : "Road";

  return (
    <>
      <PageHeader
        title={activity.name?.trim() || "Untitled run"}
        description={formatDateTime(activity.startDateLocal)}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" disabled={!neighbours.previousId} asChild={!!neighbours.previousId}>
              {neighbours.previousId ? (
                <Link href={`/activities/${neighbours.previousId}`} aria-label="Previous run">
                  <ChevronLeft className="size-4" />
                </Link>
              ) : (
                <span>
                  <ChevronLeft className="size-4" />
                </span>
              )}
            </Button>
            <Button variant="outline" size="icon" disabled={!neighbours.nextId} asChild={!!neighbours.nextId}>
              {neighbours.nextId ? (
                <Link href={`/activities/${neighbours.nextId}`} aria-label="Next run">
                  <ChevronRight className="size-4" />
                </Link>
              ) : (
                <span>
                  <ChevronRight className="size-4" />
                </span>
              )}
            </Button>
            <Button variant="outline" asChild>
              <Link href="/activities">Back</Link>
            </Button>
          </div>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{typeLabel}</Badge>
        {activity.isRace ? <Badge>Race</Badge> : null}
        {activity.isTreadmill ? <Badge variant="outline">Treadmill</Badge> : null}
        {activity.deviceName ? (
          <Badge variant="outline" className="font-normal">
            {activity.deviceName}
          </Badge>
        ) : null}
        {activity.source ? (
          <Badge variant="outline" className="font-normal">
            via {activity.source}
          </Badge>
        ) : null}
      </div>

      <Card>
        <CardContent className="grid grid-cols-2 gap-6 pt-6 sm:grid-cols-3 lg:grid-cols-6">
          <Metric label="Distance" value={formatKm(activity.distanceM, 2)} />
          <Metric
            label="Moving time"
            value={formatDuration(activity.movingTimeS)}
            hint={
              activity.elapsedTimeS
                ? `${formatDuration(activity.elapsedTimeS)} elapsed`
                : undefined
            }
          />
          <Metric
            label="Pace"
            value={formatPaceWithUnit(activity.paceSPerKm)}
            hint={
              activity.gapSPerKm
                ? `${formatPaceWithUnit(activity.gapSPerKm)} grade-adjusted`
                : undefined
            }
          />
          <Metric
            label="Avg HR"
            value={activity.avgHr ? `${activity.avgHr} bpm` : EM_DASH}
            hint={activity.maxHr ? `${activity.maxHr} max` : undefined}
          />
          <Metric
            label="Elevation"
            value={formatElevation(activity.elevationGainM)}
            hint={
              activity.elevationLossM
                ? `${formatElevation(activity.elevationLossM)} down`
                : undefined
            }
          />
          <Metric
            label="Training load"
            value={formatInteger(activity.trainingLoad)}
            hint={
              activity.intensity ? `${formatDecimal(activity.intensity, 2)} intensity` : undefined
            }
          />
        </CardContent>
      </Card>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <Metric
              label="Cadence"
              value={activity.avgCadence ? `${Math.round(activity.avgCadence)} spm` : EM_DASH}
              hint={
                activity.avgStrideM
                  ? `${formatDecimal(activity.avgStrideM, 2)} m stride`
                  : undefined
              }
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <Metric
              label="Decoupling"
              value={activity.decoupling != null ? `${formatDecimal(activity.decoupling)}%` : EM_DASH}
              hint="HR drift vs pace"
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <Metric
              label="Efficiency factor"
              value={formatDecimal(activity.efficiencyFactor, 2)}
              hint={activity.trimp ? `${formatInteger(activity.trimp)} TRIMP` : undefined}
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <Metric
              label="Calories"
              value={formatInteger(activity.calories)}
              hint={
                activity.feel || activity.rpe
                  ? `Feel ${activity.feel ?? EM_DASH} · RPE ${activity.rpe ?? EM_DASH}`
                  : undefined
              }
            />
          </CardContent>
        </Card>
      </div>

      {streamError ? (
        <p className="text-muted-foreground mt-6 text-sm">{streamError}</p>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Pace and heart rate</CardTitle>
            <CardDescription>Over distance, pace smoothed across samples</CardDescription>
          </CardHeader>
          <CardContent>
            {series.length > 1 ? (
              <PaceHrChart data={series} />
            ) : (
              <p className="text-muted-foreground py-8 text-center text-sm">
                No stream data for this activity.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="size-4" />
              Route
            </CardTitle>
          </CardHeader>
          <CardContent>
            {line.length > 1 ? (
              <RouteMap activityId={activity.id} line={line} bounds={bounds} />
            ) : (
              <p className="text-muted-foreground py-8 text-center text-sm">
                {activity.isTreadmill ? "Treadmill run — no GPS." : "No GPS data."}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardContent className="pt-6">
          <Tabs defaultValue="splits">
            <TabsList>
              <TabsTrigger value="splits">Splits</TabsTrigger>
              <TabsTrigger value="zones">Zones</TabsTrigger>
            </TabsList>
            <TabsContent value="splits" className="mt-4">
              <SplitsTable splits={splits} />
            </TabsContent>
            <TabsContent value="zones" className="mt-4 grid gap-8 md:grid-cols-2">
              <div>
                <h3 className="mb-3 text-sm font-medium">Heart rate zones</h3>
                <ZoneBars times={activity.hrZoneTimes} label="Heart rate zone" />
              </div>
              <div>
                <h3 className="mb-3 text-sm font-medium">Pace zones</h3>
                <ZoneBars times={activity.paceZoneTimes} label="Pace zone" />
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </>
  );
}
