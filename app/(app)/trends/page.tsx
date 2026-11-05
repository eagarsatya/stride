import { DecouplingChart } from "@/components/charts/decoupling-chart";
import { EfficiencyChart } from "@/components/charts/efficiency-chart";
import { MonthlyVolumeChart } from "@/components/charts/monthly-volume-chart";
import { NoRunsState, NotConnectedState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { ZoneBars } from "@/components/zone-bars";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  getEfficiencyTrend,
  getMonthlyVolume,
  getZoneTotals,
} from "@/lib/analytics";
import { getConnection } from "@/lib/connections";
import { formatDecimal } from "@/lib/format";
import { getSummary } from "@/lib/queries";
import { getDistanceUnit } from "@/lib/settings";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Trends" };

export default async function TrendsPage() {
  const user = await requireUser();

  const [connection, summary, unit] = await Promise.all([
    getConnection(user.id),
    getSummary(user.id),
    getDistanceUnit(user.id),
  ]);

  if (summary.all.runs === 0) {
    return (
      <>
        <PageHeader title="Trends" />
        {connection ? <NoRunsState /> : <NotConnectedState />}
      </>
    );
  }

  const [monthly, efficiency, zones] = await Promise.all([
    getMonthlyVolume(user.id, 24),
    getEfficiencyTrend(user.id, 365),
    getZoneTotals(user.id, 90),
  ]);

  const decoupled = efficiency.filter((point) => point.decoupling != null);
  const averageDecoupling =
    decoupled.length > 0
      ? decoupled.reduce((sum, point) => sum + (point.decoupling ?? 0), 0) / decoupled.length
      : null;

  return (
    <>
      <PageHeader
        title="Trends"
        description="How your training and aerobic fitness are moving over time."
      />

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Monthly volume</CardTitle>
            <CardDescription>
              {unit === "mi" ? "Miles" : "Kilometres"} per month, last 24 months
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MonthlyVolumeChart data={monthly} unit={unit} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pace vs heart rate</CardTitle>
            <CardDescription>
              {efficiency.length > 0
                ? "Runs over 3 km in the last 12 months. Pace drifting faster while heart rate holds flat means aerobic fitness is improving."
                : "Needs runs with both heart rate and pace recorded."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {efficiency.length > 1 ? (
              <EfficiencyChart data={efficiency} unit={unit} />
            ) : (
              <p className="text-muted-foreground py-8 text-center text-sm">
                Not enough runs with heart rate data yet.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Aerobic decoupling</CardTitle>
            <CardDescription>
              {averageDecoupling != null
                ? `Averaging ${formatDecimal(averageDecoupling)}% across ${decoupled.length} runs. Bars above the 5% line drifted more than a well-controlled aerobic effort should.`
                : "Intervals.icu computes this per activity; it appears once your runs have been analyzed."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {decoupled.length > 0 ? (
              <DecouplingChart data={efficiency} />
            ) : (
              <p className="text-muted-foreground py-8 text-center text-sm">
                No decoupling data yet.
              </p>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Heart rate zones</CardTitle>
              <CardDescription>Time in zone, last 90 days</CardDescription>
            </CardHeader>
            <CardContent>
              <ZoneBars times={zones.hr} label="Heart rate zone" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Pace zones</CardTitle>
              <CardDescription>Time in zone, last 90 days</CardDescription>
            </CardHeader>
            <CardContent>
              <ZoneBars times={zones.pace} label="Pace zone" />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
