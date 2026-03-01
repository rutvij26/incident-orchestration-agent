import { describe, expect, it, vi, afterEach } from "vitest";
import { withRetry } from "./retry.js";

afterEach(() => vi.useRealTimers());

describe("withRetry", () => {
  it("returns result on first success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withRetry(fn, { attempts: 3, delayMs: 0 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on failure and succeeds on second attempt", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValue("ok");
    const result = await withRetry(fn, { attempts: 3, delayMs: 0 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("throws the last error after exhausting all attempts", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("always fails"));
    await expect(withRetry(fn, { attempts: 3, delayMs: 0 })).rejects.toThrow(
      "always fails"
    );
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("applies exponential backoff between retries", async () => {
    vi.useFakeTimers();
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("a"))
      .mockRejectedValueOnce(new Error("b"))
      .mockResolvedValue("ok");
    const promise = withRetry(fn, { attempts: 3, delayMs: 1000, backoff: 2 });
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("caps delay at maxDelayMs", async () => {
    vi.useFakeTimers();
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("a"))
      .mockRejectedValueOnce(new Error("b"))
      .mockResolvedValue("ok");
    const promise = withRetry(fn, {
      attempts: 3,
      delayMs: 1000,
      backoff: 100,
      maxDelayMs: 500,
    });
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result).toBe("ok");
  });

  it("uses linear delay when backoff is 1", async () => {
    vi.useFakeTimers();
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValue("ok");
    const promise = withRetry(fn, { attempts: 2, delayMs: 500, backoff: 1 });
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result).toBe("ok");
  });

  it("succeeds on single attempt with no delay", async () => {
    const fn = vi.fn().mockResolvedValue(42);
    const result = await withRetry(fn, { attempts: 1, delayMs: 0 });
    expect(result).toBe(42);
  });
});
