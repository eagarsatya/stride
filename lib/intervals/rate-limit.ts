function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Serializes outbound requests and enforces a minimum gap between them.
 *
 * Personal API keys are capped at 2500 requests per rolling 15 minutes, so the
 * default gap keeps a single process comfortably under that. This is per-process
 * and therefore best-effort on serverless -- the retry path in the client is
 * what actually guarantees we survive a 429.
 */
export class RequestQueue {
  private chain: Promise<unknown> = Promise.resolve();
  private lastStartedAt = 0;

  constructor(private readonly minIntervalMs: number) {}

  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.chain.then(async () => {
      const elapsed = Date.now() - this.lastStartedAt;
      const wait = this.minIntervalMs - elapsed;
      if (wait > 0) await sleep(wait);

      this.lastStartedAt = Date.now();
      return task();
    });

    // Swallow rejections on the chain itself, otherwise one failed request
    // would poison every queued request behind it.
    this.chain = result.then(
      () => undefined,
      () => undefined,
    );

    return result;
  }
}

export { sleep };
