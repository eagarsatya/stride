import type { z } from "zod";

import { authHeader, type IntervalsCredential } from "./credentials";
import {
  IntervalsApiError,
  IntervalsAuthError,
  IntervalsRateLimitError,
  IntervalsResponseError,
} from "./errors";
import { RequestQueue, sleep } from "./rate-limit";
import {
  activityDetailSchema,
  activityListSchema,
  activitySchema,
  profileSchema,
  resolveAthlete,
  streamListSchema,
  wellnessListSchema,
  wellnessSchema,
  type IntervalsActivity,
  type IntervalsActivityDetail,
  type IntervalsStream,
  type IntervalsWellness,
} from "./schemas";

const BASE_URL = "https://intervals.icu/api/v1";
const TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 4;
const BASE_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 8_000;

/** ~2.5 requests/second, against a budget of 2500 per 15 minutes. */
const queue = new RequestQueue(400);

export const DEFAULT_STREAM_TYPES = [
  "time",
  "distance",
  "heartrate",
  "velocity_smooth",
  "altitude",
  "cadence",
  "latlng",
] as const;

export type DateInput = Date | string;

/** Intervals.icu expects `oldest`/`newest` as plain YYYY-MM-DD. */
export function toApiDate(value: DateInput): string {
  if (typeof value === "string") return value.slice(0, 10);

  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function backoffMs(attempt: number, retryAfterMs?: number): number {
  if (retryAfterMs !== undefined) return Math.min(retryAfterMs, 60_000);

  const exponential = Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS);
  // Jitter spreads retries so concurrent syncs do not stampede together.
  return exponential / 2 + Math.random() * (exponential / 2);
}

function retryAfterFromHeaders(headers: Headers): number | undefined {
  const raw = headers.get("retry-after");
  if (!raw) return undefined;

  const seconds = Number(raw);
  if (Number.isFinite(seconds)) return seconds * 1000;

  const date = Date.parse(raw);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
}

export type ParseResult<T> = {
  items: T[];
  /** Rows the API returned that did not match the expected shape. */
  skipped: number;
};

/**
 * Parse a list defensively: one malformed row is dropped and counted rather
 * than failing the whole sync window.
 */
function parseList<T>(rows: unknown[], schema: z.ZodType<T>): ParseResult<T> {
  const items: T[] = [];
  let skipped = 0;

  for (const row of rows) {
    const parsed = schema.safeParse(row);
    if (parsed.success) items.push(parsed.data);
    else skipped += 1;
  }

  return { items, skipped };
}

export class IntervalsClient {
  private readonly authorization: string;

  constructor(
    credential: IntervalsCredential,
    /**
     * Real athlete id, e.g. "i230851". Only `/athlete/0/profile` is guaranteed
     * to accept the "0" shortcut, so everything else uses the resolved id.
     */
    private readonly athleteId: string = "0",
  ) {
    this.authorization = authHeader(credential);
  }

  private async fetchJson(
    path: string,
    query?: Record<string, string | number | boolean | undefined>,
  ): Promise<unknown> {
    const url = new URL(`${BASE_URL}${path}`);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    let lastError: unknown;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      if (attempt > 0) {
        const retryAfterMs =
          lastError instanceof IntervalsRateLimitError ? lastError.retryAfterMs : undefined;
        await sleep(backoffMs(attempt, retryAfterMs));
      }

      try {
        const response = await queue.run(() =>
          fetch(url, {
            headers: {
              Authorization: this.authorization,
              Accept: "application/json",
            },
            cache: "no-store",
            signal: AbortSignal.timeout(TIMEOUT_MS),
          }),
        );

        if (response.ok) return await response.json();

        // Cap the captured body so a huge error page cannot bloat logs.
        const body = (await response.text().catch(() => "")).slice(0, 500);

        if (response.status === 401 || response.status === 403) {
          // A bad credential will never succeed on retry.
          throw new IntervalsAuthError(
            "Intervals.icu rejected the credential.",
            response.status,
            body,
          );
        }

        if (response.status === 429) {
          lastError = new IntervalsRateLimitError(
            "Intervals.icu rate limit reached.",
            retryAfterFromHeaders(response.headers),
            body,
          );
          continue;
        }

        if (response.status >= 500) {
          lastError = new IntervalsApiError(
            `Intervals.icu server error on ${path}.`,
            response.status,
            body,
          );
          continue;
        }

        throw new IntervalsApiError(
          `Intervals.icu request failed for ${path}.`,
          response.status,
          body,
        );
      } catch (error) {
        // Auth failures and other 4xx are terminal; everything else (network
        // errors, timeouts, 5xx, 429) falls through to another attempt.
        if (error instanceof IntervalsAuthError) throw error;
        if (error instanceof IntervalsApiError && error.status < 500 && error.status !== 429) {
          throw error;
        }
        lastError = error;
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new IntervalsApiError(`Intervals.icu request failed for ${path}.`, 0);
  }

  private async fetchParsed<T>(
    path: string,
    schema: z.ZodType<T>,
    query?: Record<string, string | number | boolean | undefined>,
  ): Promise<T> {
    const json = await this.fetchJson(path, query);
    const parsed = schema.safeParse(json);

    if (!parsed.success) {
      throw new IntervalsResponseError(
        `Unexpected response shape from ${path}.`,
        parsed.error.issues
          .slice(0, 5)
          .map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`)
          .join("; "),
      );
    }

    return parsed.data;
  }

  /**
   * Validates a credential and resolves the athlete it belongs to. This is the
   * only call that may use the "0" athlete shortcut.
   */
  async profile(): Promise<{ id: string; name: string | null }> {
    const profile = await this.fetchParsed("/athlete/0/profile", profileSchema);
    const athlete = resolveAthlete(profile);

    if (!athlete) {
      throw new IntervalsResponseError(
        "Intervals.icu did not return an athlete id for this key.",
      );
    }

    return athlete;
  }

  async listActivities(range: {
    oldest: DateInput;
    newest: DateInput;
  }): Promise<ParseResult<IntervalsActivity>> {
    const rows = await this.fetchParsed(
      `/athlete/${this.athleteId}/activities`,
      activityListSchema,
      { oldest: toApiDate(range.oldest), newest: toApiDate(range.newest) },
    );

    return parseList(rows, activitySchema);
  }

  async getActivity(activityId: string): Promise<IntervalsActivityDetail> {
    return this.fetchParsed(`/activity/${activityId}`, activityDetailSchema, {
      intervals: true,
    });
  }

  async getStreams(
    activityId: string,
    types: readonly string[] = DEFAULT_STREAM_TYPES,
  ): Promise<IntervalsStream[]> {
    return this.fetchParsed(`/activity/${activityId}/streams.json`, streamListSchema, {
      types: types.join(","),
    });
  }

  async listWellness(range: {
    oldest: DateInput;
    newest: DateInput;
  }): Promise<ParseResult<IntervalsWellness>> {
    // Only the `wellness{ext}` route serves GET, so the extension is required.
    const rows = await this.fetchParsed(
      `/athlete/${this.athleteId}/wellness.json`,
      wellnessListSchema,
      { oldest: toApiDate(range.oldest), newest: toApiDate(range.newest) },
    );

    return parseList(rows, wellnessSchema);
  }
}
