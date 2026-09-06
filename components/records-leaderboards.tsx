"use client";

import Link from "next/link";

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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ElevationRecord, LongestRun, VolumePeriod } from "@/lib/analytics";
import {
  formatDate,
  formatDuration,
  formatElevation,
  formatKm,
  formatPace,
  formatSignedDuration,
} from "@/lib/format";
import { PR_DISTANCES, PR_LABELS, PR_SHORT_LABELS, type PersonalRecord } from "@/lib/records";
import { cn } from "@/lib/utils";

const MONTH_FORMAT = new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric" });

function formatMonthKey(key: string): string {
  const [year, month] = key.split("-");
  if (!year || !month) return key;
  return MONTH_FORMAT.format(new Date(Number(year), Number(month) - 1, 1));
}

function formatSignedKm(metres: number): string {
  const rounded = Number((metres / 1000).toFixed(1));
  if (rounded === 0) return "0 km";
  const sign = rounded > 0 ? "+" : "−";
  return `${sign}${Math.abs(rounded).toFixed(1)} km`;
}

function formatSignedElevation(metres: number): string {
  const rounded = Math.round(metres);
  if (rounded === 0) return "0 m";
  const sign = rounded > 0 ? "+" : "−";
  return `${sign}${Math.abs(rounded).toLocaleString("en-US")} m`;
}

function Rank({ n }: { n: number }) {
  return (
    <span
      className={cn(
        "font-mono text-xs tabular-nums",
        n === 1 && "font-semibold text-amber-500",
        n === 2 && "font-semibold text-zinc-400",
        n === 3 && "font-semibold text-amber-700 dark:text-amber-600",
        n > 3 && "text-muted-foreground",
      )}
    >
      {n}
    </span>
  );
}

function Behind({ value }: { value: string | null }) {
  return (
    <span className="text-muted-foreground font-mono text-xs tabular-nums">{value ?? "—"}</span>
  );
}

function ActivityLink({
  href,
  name,
  fallback,
}: {
  href?: string;
  name: string | null;
  fallback: string;
}) {
  const label = name?.trim() || fallback;
  if (!href) return <span className="font-medium">{label}</span>;

  return (
    <Link href={href} className="hover:text-primary font-medium">
      {label}
    </Link>
  );
}

export function RecordsLeaderboards({
  personalRecordLists,
  longestRuns,
  biggestWeeks,
  biggestMonths,
  mostElevation,
}: {
  personalRecordLists: Record<string, PersonalRecord[]>;
  longestRuns: LongestRun[];
  biggestWeeks: VolumePeriod[];
  biggestMonths: VolumePeriod[];
  mostElevation: ElevationRecord[];
}) {
  const prTabs = PR_DISTANCES.filter((distance) => personalRecordLists[String(distance)]?.length);
  const milestoneTabs = (
    [
      { value: "longest", label: "Longest", rows: longestRuns.length },
      { value: "weeks", label: "Weeks", rows: biggestWeeks.length },
      { value: "months", label: "Months", rows: biggestMonths.length },
      { value: "elevation", label: "Elevation", rows: mostElevation.length },
    ] as const
  ).filter((tab) => tab.rows > 0);

  if (prTabs.length === 0 && milestoneTabs.length === 0) return null;

  return (
    <div className="mt-10 space-y-6">
      {prTabs.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Distance records</CardTitle>
            <CardDescription>
              Fastest ten efforts at each standard distance, from full-resolution streams.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue={String(prTabs[0])}>
              <TabsList className="h-auto max-w-full flex-wrap">
                {prTabs.map((distance) => {
                  const key = String(distance);
                  return (
                    <TabsTrigger key={key} value={key}>
                      {PR_SHORT_LABELS[key] ?? PR_LABELS[key]}
                    </TabsTrigger>
                  );
                })}
              </TabsList>
              {prTabs.map((distance) => {
                const key = String(distance);
                const rows = personalRecordLists[key] ?? [];
                const leader = rows[0];

                return (
                  <TabsContent key={key} value={key} className="mt-4">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10">#</TableHead>
                          <TableHead>Run</TableHead>
                          <TableHead className="hidden sm:table-cell">Date</TableHead>
                          <TableHead className="text-right">Time</TableHead>
                          <TableHead className="text-right">Pace</TableHead>
                          <TableHead className="hidden text-right sm:table-cell">Behind</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows.map((record, index) => (
                          <TableRow key={`${record.activityId}-${record.distanceM}`}>
                            <TableCell>
                              <Rank n={index + 1} />
                            </TableCell>
                            <TableCell>
                              <div className="flex min-w-0 items-center gap-2">
                                <ActivityLink
                                  href={`/activities/${record.activityId}`}
                                  name={record.activityName}
                                  fallback="Untitled run"
                                />
                                {record.isRace ? (
                                  <Badge variant="secondary" className="text-[10px]">
                                    Race
                                  </Badge>
                                ) : null}
                              </div>
                              <span className="text-muted-foreground block text-xs sm:hidden">
                                {formatDate(record.date)}
                              </span>
                            </TableCell>
                            <TableCell className="text-muted-foreground hidden text-sm sm:table-cell">
                              {formatDate(record.date)}
                            </TableCell>
                            <TableCell className="text-right font-mono tabular-nums">
                              {formatDuration(record.timeS)}
                            </TableCell>
                            <TableCell className="text-right font-mono tabular-nums">
                              {formatPace((record.timeS / record.distanceM) * 1000)}
                            </TableCell>
                            <TableCell className="hidden text-right sm:table-cell">
                              <Behind
                                value={
                                  index === 0
                                    ? null
                                    : formatSignedDuration(record.timeS - leader.timeS)
                                }
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TabsContent>
                );
              })}
            </Tabs>
          </CardContent>
        </Card>
      ) : null}

      {milestoneTabs.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Milestone lists</CardTitle>
            <CardDescription>Top ten longest runs, biggest weeks and months, and most climbing.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue={milestoneTabs[0].value}>
              <TabsList className="h-auto max-w-full flex-wrap">
                {milestoneTabs.map((tab) => (
                  <TabsTrigger key={tab.value} value={tab.value}>
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>

              {longestRuns.length > 0 ? (
                <TabsContent value="longest" className="mt-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">#</TableHead>
                        <TableHead>Run</TableHead>
                        <TableHead className="hidden sm:table-cell">Date</TableHead>
                        <TableHead className="text-right">Distance</TableHead>
                        <TableHead className="hidden text-right sm:table-cell">Time</TableHead>
                        <TableHead className="text-right">Pace</TableHead>
                        <TableHead className="hidden text-right md:table-cell">Behind</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {longestRuns.map((run, index) => (
                        <TableRow key={run.activityId}>
                          <TableCell>
                            <Rank n={index + 1} />
                          </TableCell>
                          <TableCell>
                            <ActivityLink
                              href={`/activities/${run.activityId}`}
                              name={run.name}
                              fallback="Untitled run"
                            />
                            <span className="text-muted-foreground block text-xs sm:hidden">
                              {formatDate(run.date)}
                            </span>
                          </TableCell>
                          <TableCell className="text-muted-foreground hidden text-sm sm:table-cell">
                            {formatDate(run.date)}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums">
                            {formatKm(run.distanceM, 2)}
                          </TableCell>
                          <TableCell className="hidden text-right font-mono tabular-nums sm:table-cell">
                            {formatDuration(run.movingTimeS)}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums">
                            {formatPace(run.paceSPerKm)}
                          </TableCell>
                          <TableCell className="hidden text-right md:table-cell">
                            <Behind
                              value={
                                index === 0
                                  ? null
                                  : formatSignedKm(run.distanceM - longestRuns[0].distanceM)
                              }
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TabsContent>
              ) : null}

              {biggestWeeks.length > 0 ? (
                <TabsContent value="weeks" className="mt-4">
                  <VolumeTable rows={biggestWeeks} label="Week of" formatKey={formatDate} />
                </TabsContent>
              ) : null}

              {biggestMonths.length > 0 ? (
                <TabsContent value="months" className="mt-4">
                  <VolumeTable rows={biggestMonths} label="Month" formatKey={formatMonthKey} />
                </TabsContent>
              ) : null}

              {mostElevation.length > 0 ? (
                <TabsContent value="elevation" className="mt-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">#</TableHead>
                        <TableHead>Run</TableHead>
                        <TableHead className="hidden sm:table-cell">Date</TableHead>
                        <TableHead className="text-right">Elevation</TableHead>
                        <TableHead className="hidden text-right sm:table-cell">Distance</TableHead>
                        <TableHead className="hidden text-right md:table-cell">Behind</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {mostElevation.map((run, index) => (
                        <TableRow key={run.activityId}>
                          <TableCell>
                            <Rank n={index + 1} />
                          </TableCell>
                          <TableCell>
                            <ActivityLink
                              href={`/activities/${run.activityId}`}
                              name={run.name}
                              fallback="Untitled run"
                            />
                            <span className="text-muted-foreground block text-xs sm:hidden">
                              {formatDate(run.date)}
                            </span>
                          </TableCell>
                          <TableCell className="text-muted-foreground hidden text-sm sm:table-cell">
                            {formatDate(run.date)}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums">
                            {formatElevation(run.elevationM)}
                          </TableCell>
                          <TableCell className="hidden text-right font-mono tabular-nums sm:table-cell">
                            {formatKm(run.distanceM, 2)}
                          </TableCell>
                          <TableCell className="hidden text-right md:table-cell">
                            <Behind
                              value={
                                index === 0
                                  ? null
                                  : formatSignedElevation(
                                      run.elevationM - mostElevation[0].elevationM,
                                    )
                              }
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TabsContent>
              ) : null}
            </Tabs>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function VolumeTable({
  rows,
  label,
  formatKey,
}: {
  rows: VolumePeriod[];
  label: string;
  formatKey: (key: string) => string;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10">#</TableHead>
          <TableHead>{label}</TableHead>
          <TableHead className="text-right">Distance</TableHead>
          <TableHead className="hidden text-right sm:table-cell">Runs</TableHead>
          <TableHead className="hidden text-right sm:table-cell">Behind</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, index) => (
          <TableRow key={row.key}>
            <TableCell>
              <Rank n={index + 1} />
            </TableCell>
            <TableCell className="font-medium">{formatKey(row.key)}</TableCell>
            <TableCell className="text-right font-mono tabular-nums">
              {formatKm(row.distanceM)}
            </TableCell>
            <TableCell className="text-muted-foreground hidden text-right font-mono tabular-nums sm:table-cell">
              {row.runs}
            </TableCell>
            <TableCell className="hidden text-right sm:table-cell">
              <Behind
                value={index === 0 ? null : formatSignedKm(row.distanceM - rows[0].distanceM)}
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
