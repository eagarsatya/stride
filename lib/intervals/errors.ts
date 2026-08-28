export class IntervalsApiError extends Error {
  readonly status: number;
  readonly body?: string;

  constructor(message: string, status: number, body?: string) {
    super(message);
    this.name = "IntervalsApiError";
    this.status = status;
    this.body = body;
  }
}

/** 401/403 -- the stored credential is wrong, revoked, or lacks a scope. */
export class IntervalsAuthError extends IntervalsApiError {
  constructor(message: string, status: number, body?: string) {
    super(message, status, body);
    this.name = "IntervalsAuthError";
  }
}

/** 429 -- the account's daily or rolling request budget is exhausted. */
export class IntervalsRateLimitError extends IntervalsApiError {
  readonly retryAfterMs?: number;

  constructor(message: string, retryAfterMs?: number, body?: string) {
    super(message, 429, body);
    this.name = "IntervalsRateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

/** The response was not valid JSON, or did not match the expected shape. */
export class IntervalsResponseError extends Error {
  readonly detail?: string;

  constructor(message: string, detail?: string) {
    super(message);
    this.name = "IntervalsResponseError";
    this.detail = detail;
  }
}

/**
 * Message safe to show a user. Never includes the response body, which can
 * echo request parameters.
 */
export function describeIntervalsError(error: unknown): string {
  if (error instanceof IntervalsAuthError) {
    return "Intervals.icu rejected the API key. Re-generate it in Settings → Developer Settings and reconnect.";
  }
  if (error instanceof IntervalsRateLimitError) {
    return "Intervals.icu rate limit reached. Try again later.";
  }
  if (error instanceof IntervalsApiError) {
    return `Intervals.icu returned an error (HTTP ${error.status}).`;
  }
  if (error instanceof IntervalsResponseError) {
    return "Intervals.icu returned an unexpected response.";
  }
  if (error instanceof Error && error.name === "TimeoutError") {
    return "Intervals.icu did not respond in time.";
  }
  return "Could not reach Intervals.icu.";
}
