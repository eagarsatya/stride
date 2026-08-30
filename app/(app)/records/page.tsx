import { CalendarRange, Flag, Flame, Mountain, Route, Trophy } from "lucide-react";
import Link from "next/link";

import { AnalyzeRunsButton } from "@/components/analyze-runs-button";
import { NoRunsState, NotConnectedState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getRecords } from "@/lib/analytics";
import { getConnection } from "@/lib/connections";
import {
  formatDate,
  formatDuration,
  formatElevation,
  formatKm,
  formatPace,
  formatPaceWithUnit,
} from "@/lib/format";
import { getSummary } from "@/lib/queries";
import { PR_LABELS } from "@/lib/records";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Records" };

/** Batch analysis runs in a server action on this segment. */
export const maxDuration = 300;

export default async function RecordsPage() {
  const user = await requireUser();

  const [connection, summary] = await Promise.all([
    getConnection(user.id),
    getSummary(user.id),
  ]);

  if (summary.all.runs === 0) {
    return (
      <>
        <PageHeader title="Records" />
        {connection ? <NoRunsState /> : <NotConnectedState />}
      </>
    );
  }

  const records = await getRecords(user.id);

  return (
    <>
      <PageHeader
        title="Records"
        description="Bests pulled from your synced history."
      />

      {records.pendingAnalysis > 0 ? (
        <Alert className="mb-6">
          <Trophy />
          <AlertTitle>
            {records.analyzed === 0
              ? "Personal records need one pass over your runs"
              : `${records.pendingAnalysis} runs still to analyze`}
          </AlertTitle>
          <AlertDescription className="space-y-3">
            <p>
              Distance records come from the full-resolution distance and time streams,
              which are fetched per run and then cached. Analyzed runs also load instantly
              on their detail page afterwards.
            </p>
            <AnalyzeRunsButton pending={records.pendingAnalysis} />
          </AlertDescription>
        </Alert>
      ) : null}

      {records.personalRecords.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {records.personalRecords.map((record) => (
            <Card key={record.distanceM} className="bg-card/60">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-muted-foreground text-sm font-medium">
                    {PR_LABELS[String(record.distanceM)]}
                  </p>
                  {record.isRace ? (
                    <Badge variant="secondary" className="text-[10px]">
                      Race
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-2 font-mono text-2xl font-semibold tabular-nums">
                  {formatDuration(record.timeS)}
                </p>
                <p className="text-muted-foreground mt-1 font-mono text-xs tabular-nums">
                  {formatPaceWithUnit((record.timeS / record.distanceM) * 1000)}
                </p>
                <Link
                  href={`/activities/${record.activityId}`}
                  className="text-muted-foreground hover:text-foreground mt-2 block truncate text-xs underline underline-offset-4"
                >
                  {record.activityName?.trim() || "Untitled run"} · {formatDate(record.date)}
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : records.pendingAnalysis === 0 ? (
        <p className="text-muted-foreground text-sm">
          No distance records found. Your runs may not include the distance and time
          streams needed to compute them.
        </p>
      ) : null}

      <h2 className="mt-10 mb-4 text-lg font-semibold tracking-tight">Milestones</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Longest run"
          value={formatKm(records.longestRun?.distanceM ?? null)}
          hint={
            records.longestRun
              ? `${records.longestRun.name?.trim() || "Untitled run"} · ${formatDate(records.longestRun.date)}`
              : undefined
          }
          icon={Route}
        />
        <StatCard
          label="Biggest week"
          value={formatKm(records.biggestWeek?.distanceM ?? null)}
          hint={
            records.biggestWeek
              ? `Week of ${formatDate(records.biggestWeek.weekStart)}`
              : undefined
          }
          icon={CalendarRange}
        />
        <StatCard
          label="Biggest month"
          value={formatKm(records.biggestMonth?.distanceM ?? null, 0)}
          hint={records.biggestMonth?.month}
          icon={CalendarRange}
        />
        <StatCard
          label="Most elevation"
          value={formatElevation(records.mostElevation?.elevationM ?? null)}
          hint={
            records.mostElevation
              ? `${records.mostElevation.name?.trim() || "Untitled run"} · ${formatDate(records.mostElevation.date)}`
              : undefined
          }
          icon={Mountain}
        />
        <StatCard
          label="Longest streak"
          value={`${summary.longestStreak} days`}
          hint={`Current: ${summary.currentStreak} days`}
          icon={Flame}
        />
        <StatCard
          label="All time"
          value={formatKm(summary.all.distanceM, 0)}
          hint={`${summary.all.runs} runs · ${formatPaceWithUnit(summary.all.paceSPerKm)} average`}
          icon={Trophy}
        />
      </div>

      {records.races.length > 0 ? (
        <Card className="mt-10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Flag className="size-4" />
              Races
            </CardTitle>
            <CardDescription>Activities you marked as a race in Intervals.icu</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Race</TableHead>
                  <TableHead className="hidden sm:table-cell">Date</TableHead>
                  <TableHead className="text-right">Distance</TableHead>
                  <TableHead className="text-right">Time</TableHead>
                  <TableHead className="text-right">Pace</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.races.map((race) => (
                  <TableRow key={race.activityId}>
                    <TableCell>
                      <Link
                        href={`/activities/${race.activityId}`}
                        className="hover:text-primary font-medium"
                      >
                        {race.name?.trim() || "Untitled race"}
                      </Link>
                      <span className="text-muted-foreground block text-xs sm:hidden">
                        {formatDate(race.date)}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden text-sm sm:table-cell">
                      {formatDate(race.date)}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {formatKm(race.distanceM, 2)}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {formatDuration(race.movingTimeS)}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {formatPace(race.paceSPerKm)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
