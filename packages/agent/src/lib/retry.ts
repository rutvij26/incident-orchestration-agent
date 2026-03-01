export type RetryOptions = {
  attempts: number;
  delayMs: number;
  /** Backoff multiplier applied after each failure. Default: 2 (exponential). Set to 1 for linear. */
  backoff?: number;
  /** Maximum delay cap in ms. Default: 30000. */
  maxDelayMs?: number;
};

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  const { attempts, backoff = 2, maxDelayMs = 30_000 } = options;
  let lastError: unknown;
  let delay = options.delayMs;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        // Full-jitter: random value in [0, delay] to avoid thundering herd
        const jittered = Math.random() * delay;
        await new Promise((resolve) => setTimeout(resolve, jittered));
        delay = Math.min(delay * backoff, maxDelayMs);
      }
    }
  }
  throw lastError;
}
