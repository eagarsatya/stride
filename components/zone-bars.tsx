import { formatDuration } from "@/lib/format";

/** Zone 1 through 5+, cool to hot. */
const ZONE_COLORS = [
  "bg-sky-500/70",
  "bg-emerald-500/70",
  "bg-amber-500/70",
  "bg-orange-500/75",
  "bg-red-500/75",
  "bg-fuchsia-500/75",
];

export function ZoneBars({
  times,
  label,
}: {
  /** Seconds per zone, index 0 = zone 1. */
  times: number[] | null | undefined;
  label: string;
}) {
  const zones = (times ?? []).filter((value) => Number.isFinite(value));
  const total = zones.reduce((sum, value) => sum + value, 0);

  if (total <= 0) {
    return (
      <p className="text-muted-foreground text-sm">No {label.toLowerCase()} data.</p>
    );
  }

  return (
    <div className="space-y-2">
      {zones.map((seconds, index) => {
        const share = (seconds / total) * 100;

        return (
          <div key={index} className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground w-6 shrink-0 font-mono text-xs">
              Z{index + 1}
            </span>
            <div className="bg-muted h-2.5 flex-1 overflow-hidden rounded-full">
              <div
                className={`h-full rounded-full ${ZONE_COLORS[index] ?? ZONE_COLORS.at(-1)}`}
                style={{ width: `${share}%` }}
              />
            </div>
            <span className="w-16 shrink-0 text-right font-mono text-xs tabular-nums">
              {formatDuration(seconds)}
            </span>
            <span className="text-muted-foreground w-10 shrink-0 text-right font-mono text-xs tabular-nums">
              {share.toFixed(0)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}
