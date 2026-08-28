import { Flag, Footprints, Mountain, MoveRight } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { formatDateTime, formatKm, formatPaceWithUnit } from "@/lib/format";
import type { RunListItem } from "@/lib/queries";

export function RunList({ runs }: { runs: RunListItem[] }) {
  if (runs.length === 0) {
    return <p className="text-muted-foreground text-sm">No runs yet.</p>;
  }

  return (
    <ul className="divide-border/60 divide-y">
      {runs.map((run) => (
        <li key={run.id}>
          <Link
            href={`/activities/${run.id}`}
            className="hover:bg-muted/40 -mx-2 flex items-center gap-4 rounded-md px-2 py-3 transition-colors"
          >
            <div className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg">
              {run.isRace ? (
                <Flag className="size-4" />
              ) : run.type === "TrailRun" ? (
                <Mountain className="size-4" />
              ) : (
                <Footprints className="size-4" />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-medium">
                  {run.name?.trim() || "Untitled run"}
                </p>
                {run.isRace ? (
                  <Badge variant="secondary" className="shrink-0 text-[10px]">
                    Race
                  </Badge>
                ) : null}
                {run.isTreadmill ? (
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    Treadmill
                  </Badge>
                ) : null}
              </div>
              <p className="text-muted-foreground mt-0.5 text-xs">
                {formatDateTime(run.startDateLocal)}
              </p>
            </div>

            <div className="hidden shrink-0 text-right sm:block">
              <p className="font-mono text-sm font-medium tabular-nums">
                {formatKm(run.distanceM)}
              </p>
              <p className="text-muted-foreground font-mono text-xs tabular-nums">
                {formatPaceWithUnit(run.paceSPerKm)}
              </p>
            </div>

            <MoveRight className="text-muted-foreground size-4 shrink-0" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
