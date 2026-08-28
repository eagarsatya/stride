import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDuration, formatInteger, formatPace } from "@/lib/format";
import type { Split } from "@/lib/splits";

export function SplitsTable({ splits }: { splits: Split[] }) {
  if (splits.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Splits need the distance and time streams, which this activity does not have.
      </p>
    );
  }

  const paces = splits
    .map((split) => split.paceSPerKm)
    .filter((pace): pace is number => pace != null);

  const fastest = paces.length > 0 ? Math.min(...paces) : null;
  const slowest = paces.length > 0 ? Math.max(...paces) : null;
  const range = fastest != null && slowest != null ? slowest - fastest : 0;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12">Km</TableHead>
          <TableHead className="text-right">Pace</TableHead>
          <TableHead className="text-right">Time</TableHead>
          <TableHead className="hidden text-right sm:table-cell">Avg HR</TableHead>
          <TableHead className="w-1/3">Relative</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {splits.map((split) => {
          const isPartial = split.distanceM < 950;
          // Bar length is scaled within this run's own pace range, so variation
          // is visible even on a very even run.
          const share =
            split.paceSPerKm != null && fastest != null && range > 0
              ? 100 - ((split.paceSPerKm - fastest) / range) * 65
              : split.paceSPerKm != null
                ? 100
                : 0;

          return (
            <TableRow key={split.index}>
              <TableCell className="font-mono text-xs tabular-nums">
                {isPartial ? `${(split.distanceM / 1000).toFixed(2)}` : split.index}
              </TableCell>
              <TableCell className="text-right font-mono font-medium tabular-nums">
                {formatPace(split.paceSPerKm)}
                {split.paceSPerKm != null && split.paceSPerKm === fastest ? (
                  <span className="text-primary ml-1 text-xs">★</span>
                ) : null}
              </TableCell>
              <TableCell className="text-muted-foreground text-right font-mono text-sm tabular-nums">
                {formatDuration(split.elapsedS)}
              </TableCell>
              <TableCell className="hidden text-right font-mono text-sm tabular-nums sm:table-cell">
                {formatInteger(split.avgHr)}
              </TableCell>
              <TableCell>
                <div className="bg-muted h-2 overflow-hidden rounded-full">
                  <div
                    className="bg-primary/70 h-full rounded-full"
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
