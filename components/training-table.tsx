import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDuration, formatInteger, formatPace, formatSplitDistance } from "@/lib/format";
import {
  formatStepType,
  isRestStep,
  isWorkoutType,
  type TrainingStep,
} from "@/lib/training";
import { cn } from "@/lib/utils";

function badgeVariant(type: string | null): "default" | "secondary" | "outline" {
  const rest = isRestStep(type);
  if (rest) return "secondary";
  if (isWorkoutType(type)) return "default";
  return "outline";
}

export function TrainingTable({ steps }: { steps: TrainingStep[] }) {
  if (steps.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No workout steps for this activity.
      </p>
    );
  }

  const paces = steps
    .map((step) => step.paceSPerKm)
    .filter((pace): pace is number => pace != null);

  const fastest = paces.length > 0 ? Math.min(...paces) : null;
  const slowest = paces.length > 0 ? Math.max(...paces) : null;
  const range = fastest != null && slowest != null ? slowest - fastest : 0;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10">#</TableHead>
          <TableHead>Step</TableHead>
          <TableHead className="text-right">Distance</TableHead>
          <TableHead className="text-right">Pace</TableHead>
          <TableHead className="text-right">Time</TableHead>
          <TableHead className="hidden text-right sm:table-cell">Avg HR</TableHead>
          <TableHead className="w-1/4">Relative</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {steps.map((step) => {
          const typeLabel = formatStepType(step.type);
          const rest = isRestStep(step.type);
          const extraLabel =
            step.label && (!typeLabel || step.label.toLowerCase() !== typeLabel.toLowerCase())
              ? step.label
              : !typeLabel
                ? `Step ${step.index}`
                : null;
          const share =
            step.paceSPerKm != null && fastest != null && range > 0
              ? 100 - ((step.paceSPerKm - fastest) / range) * 65
              : step.paceSPerKm != null
                ? 100
                : 0;

          return (
            <TableRow key={step.index} className={rest ? "text-muted-foreground" : undefined}>
              <TableCell className="font-mono text-xs tabular-nums">{step.index}</TableCell>
              <TableCell>
                <div className="flex flex-wrap items-center gap-2">
                  {typeLabel ? (
                    <Badge variant={badgeVariant(step.type)} className="font-normal">
                      {typeLabel}
                    </Badge>
                  ) : null}
                  {extraLabel ? <span className="text-sm font-medium">{extraLabel}</span> : null}
                  {step.groupLabel ? (
                    <span className="text-muted-foreground text-xs">{step.groupLabel}</span>
                  ) : null}
                </div>
              </TableCell>
              <TableCell className="text-right font-mono text-sm tabular-nums">
                {formatSplitDistance(step.distanceM)}
              </TableCell>
              <TableCell className="text-right font-mono font-medium tabular-nums">
                {formatPace(step.paceSPerKm)}
                {step.paceSPerKm != null && step.paceSPerKm === fastest && !rest ? (
                  <span className="text-primary ml-1 text-xs">★</span>
                ) : null}
              </TableCell>
              <TableCell className="text-muted-foreground text-right font-mono text-sm tabular-nums">
                {formatDuration(step.elapsedS)}
              </TableCell>
              <TableCell className="hidden text-right font-mono text-sm tabular-nums sm:table-cell">
                {formatInteger(step.avgHr)}
              </TableCell>
              <TableCell>
                <div className="bg-muted h-2 overflow-hidden rounded-full">
                  <div
                    className={cn("h-full rounded-full", rest ? "bg-muted-foreground/40" : "bg-primary/70")}
                    style={{ width: `${Math.max(0, Math.min(100, share))}%` }}
                  />
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
