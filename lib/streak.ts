const DAY_MS = 86_400_000;

function toUtcDay(iso: string): number {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

/**
 * Current run streak in consecutive days.
 *
 * A streak stays alive if the last run was today or yesterday -- otherwise a
 * runner would appear to have "broken" their streak simply by not having run
 * yet on the current day.
 *
 * `days` must be ISO dates (YYYY-MM-DD), newest first. `today` is injectable so
 * this stays testable.
 */
export function computeStreak(days: string[], today = new Date()): number {
  if (days.length === 0) return 0;

  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());

  // Deduplicate: two runs on one day is still one day of the streak.
  const unique: number[] = [];
  for (const day of days) {
    const value = toUtcDay(day);
    if (unique.length === 0 || unique[unique.length - 1] !== value) unique.push(value);
  }
  unique.sort((a, b) => b - a);

  const gapToLatest = (todayUtc - unique[0]) / DAY_MS;
  if (gapToLatest > 1) return 0;

  let streak = 1;
  for (let i = 1; i < unique.length; i += 1) {
    if ((unique[i - 1] - unique[i]) / DAY_MS !== 1) break;
    streak += 1;
  }

  return streak;
}

/**
 * Longest run streak anywhere in the history, for the records page.
 */
export function computeLongestStreak(days: string[]): number {
  if (days.length === 0) return 0;

  const unique = Array.from(new Set(days.map(toUtcDay))).sort((a, b) => a - b);

  let longest = 1;
  let current = 1;

  for (let i = 1; i < unique.length; i += 1) {
    if ((unique[i] - unique[i - 1]) / DAY_MS === 1) {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 1;
    }
  }

  return longest;
}
