import { CalendarDays, Flame, Route, Timer } from "lucide-react";
import Link from "next/link";

import { FitnessChart } from "@/components/charts/fitness-chart";
import { WeeklyVolumeChart } from "@/components/charts/weekly-volume-chart";
import { NoRunsState, NotConnectedState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { RunList } from "@/components/run-list";
import { StatCard } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getConnection } from "@/lib/connections";
import {
  formatDurationCompact,
  formatElevation,
  formatKm,
  formatPaceWithUnit,
} from "@/lib/format";
import {
  getFitnessSeries,
  getRecentRuns,
  getSummary,
  getWeeklyVolume,
} from "@/lib/queries";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Overview" };

export default async function DashboardPage() {
  const user = await requireUser();

  const [connection, summary] = await Promise.all([
    getConnection(user.id),
    getSummary(user.id),
  ]);

  if (!connection && summary.all.runs === 0) {
    return (
      <>
        <PageHeader title="Overview" description="Your running at a glance." />
        <NotConnectedState />
      </>
    );
  }

  if (summary.all.runs === 0) {
    return (
      <>
        <PageHeader title="Overview" description="Your running at a glance." />
        <NoRunsState message="Connected, but no runs are stored yet. Run a sync or a full backfill." />
      </>
    );
  }

  const [weekly, fitness, recent] = await Promise.all([
    getWeeklyVolume(user.id, 16),
    getFitnessSeries(user.id, 180),
    getRecentRuns(user.id, 8),
  ]);

  return (
    <>
      <PageHeader
        title="Overview"
        description={`${summary.all.runs} runs · ${formatKm(summary.all.distanceM, 0)} all time`}
        actions={
          <Button variant="outline" asChild>
            <Link href="/activities">All activities</Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="This week"
          value={formatKm(summary.week.distanceM)}
          hint={`${summary.week.runs} runs · ${formatDurationCompact(summary.week.movingTimeS)}`}
          icon={Route}
        />
        <StatCard
          label="This month"
          value={formatKm(summary.month.distanceM)}
          hint={`${summary.month.runs} runs · ${formatPaceWithUnit(summary.month.paceSPerKm)}`}
          icon={CalendarDays}
        />
        <StatCard
          label="This year"
          value={formatKm(summary.year.distanceM, 0)}
          hint={`${summary.year.runs} runs · ${formatElevation(summary.year.elevationM)} up`}
          icon={Timer}
        />
        <StatCard
          label="Current streak"
          value={`${summary.currentStreak} ${summary.currentStreak === 1 ? "day" : "days"}`}
          hint={`Longest: ${summary.longestStreak} days`}
          icon={Flame}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Weekly volume</CardTitle>
            <CardDescription>Kilometres per week, last 16 weeks</CardDescription>
          </CardHeader>
          <CardContent>
            <WeeklyVolumeChart data={weekly} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent runs</CardTitle>
            <CardDescription>Latest activities</CardDescription>
          </CardHeader>
          <CardContent>
            <RunList runs={recent} />
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Fitness, fatigue and form</CardTitle>
          <CardDescription>
            {fitness.length > 0
              ? "Last 180 days. Form above zero means fresh, below means carrying fatigue."
              : "No training load data yet — this appears once Intervals.icu has computed it."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {fitness.length > 0 ? (
            <FitnessChart data={fitness} />
          ) : (
            <p className="text-muted-foreground py-8 text-center text-sm">
              Nothing to plot yet.
            </p>
          )}
        </CardContent>
      </Card>
    </>
  );
}
