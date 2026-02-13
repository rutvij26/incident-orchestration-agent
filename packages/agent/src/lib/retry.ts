export async function withRetry<T>(
  fn: () => Promise<T>,
  options: { attempts: number; delayMs: number }
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < options.attempts) {
        await new Promise((resolve) => setTimeout(resolve, options.delayMs));
      }
    }
  }
  throw lastError;
}
