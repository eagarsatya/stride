const EM_DASH = "—";

export function formatKm(metres: number | null | undefined, digits = 1): string {
  if (metres == null || !Number.isFinite(metres)) return EM_DASH;
  return `${(metres / 1000).toFixed(digits)} km`;
}

/** Bare kilometre number, for chart axes and tight table cells. */
export function toKm(metres: number | null | undefined, digits = 1): number | null {
  if (metres == null || !Number.isFinite(metres)) return null;
  return Number((metres / 1000).toFixed(digits));
}

/** "1:23:45" for anything over an hour, otherwise "23:45". */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return EM_DASH;

  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  const pad = (n: number) => String(n).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${minutes}:${pad(secs)}`;
}

/** Signed gap from a leader, e.g. "+12s" or "+1:03". Zero is "0s". */
export function formatSignedDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return EM_DASH;

  const rounded = Math.round(seconds);
  if (rounded === 0) return "0s";

  const sign = rounded > 0 ? "+" : "−";
  const absolute = Math.abs(rounded);
  return absolute < 60 ? `${sign}${absolute}s` : `${sign}${formatDuration(absolute)}`;
}

/** Compact duration for summary tiles, e.g. "6h 12m" or "48m". */
export function formatDurationCompact(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return EM_DASH;

  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.round((total % 3600) / 60);

  if (hours === 0) return `${minutes}m`;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

/** Seconds per kilometre as "m:ss". */
export function formatPace(secondsPerKm: number | null | undefined): string {
  if (secondsPerKm == null || !Number.isFinite(secondsPerKm) || secondsPerKm <= 0) {
    return EM_DASH;
  }

  const total = Math.round(secondsPerKm);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function formatPaceWithUnit(secondsPerKm: number | null | undefined): string {
  const pace = formatPace(secondsPerKm);
  return pace === EM_DASH ? pace : `${pace} /km`;
}

export function formatInteger(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return EM_DASH;
  return Math.round(value).toLocaleString("en-US");
}

export function formatDecimal(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return EM_DASH;
  return value.toFixed(digits);
}

export function formatElevation(metres: number | null | undefined): string {
  if (metres == null || !Number.isFinite(metres)) return EM_DASH;
  return `${Math.round(metres).toLocaleString("en-US")} m`;
}

/**
 * Activity start times are stored as wall-clock strings with no zone, so parse
 * the parts directly instead of letting Date apply the server's offset.
 */
export function parseLocalTimestamp(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(value);
  if (!match) return new Date(value);

  const [, year, month, day, hour, minute, second] = match;
  return new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second ?? 0),
  );
}

const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const DATE_TIME_FORMAT = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return EM_DASH;
  const date = typeof value === "string" ? parseLocalTimestamp(value) : value;
  return Number.isNaN(date.getTime()) ? EM_DASH : DATE_FORMAT.format(date);
}

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return EM_DASH;
  const date = typeof value === "string" ? parseLocalTimestamp(value) : value;
  return Number.isNaN(date.getTime()) ? EM_DASH : DATE_TIME_FORMAT.format(date);
}

export function formatRelative(value: Date | string | null | undefined): string {
  if (!value) return "never";

  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "never";

  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 2_592_000) return `${Math.floor(seconds / 86_400)}d ago`;

  return formatDate(date);
}

export { EM_DASH };
