import { describe, expect, it, vi, afterEach } from "vitest";

vi.mock("../../lib/logger.js", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

import { LokiSourceConnector } from "./loki.js";

function okResponse(data: unknown) {
  return {
    ok: true,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(""),
  };
}

function errorResponse(status: number, body = "") {
  return {
    ok: false,
    status,
    text: () => Promise.resolve(body),
    json: () => Promise.reject(new Error("not json")),
  };
}

const opts = {
  start: new Date(Date.now() - 10 * 60 * 1000),
  end: new Date(),
  limit: 100,
};

afterEach(() => vi.restoreAllMocks());

describe("LokiSourceConnector.fetchLogs", () => {
  it("returns log events parsed from streams", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        okResponse({
          data: {
            result: [
              { stream: { job: "api" }, values: [["100", "hello"]] },
            ],
          },
        }),
      ),
    );
    const connector = new LokiSourceConnector("http://loki:3100", '{job="api"}');
    const events = await connector.fetchLogs(opts);
    expect(events).toHaveLength(1);
    expect(events[0].message).toBe("hello");
    expect(events[0].timestamp).toBe("100");
    expect(events[0].labels).toEqual({ job: "api" });
  });

  it("handles multiple streams with multiple values", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        okResponse({
          data: {
            result: [
              {
                stream: { job: "a" },
                values: [["1", "m1"], ["2", "m2"]],
              },
              { stream: { job: "b" }, values: [["3", "m3"]] },
            ],
          },
        }),
      ),
    );
    const connector = new LokiSourceConnector("http://loki:3100", "{}");
    expect(await connector.fetchLogs(opts)).toHaveLength(3);
  });

  it("returns empty array when result is empty", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(okResponse({ data: { result: [] } })),
    );
    const connector = new LokiSourceConnector("http://loki:3100", "{}");
    expect(await connector.fetchLogs(opts)).toEqual([]);
  });

  it("skips streams that are missing values or stream fields", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        okResponse({
          data: {
            result: [
              { stream: null, values: null },
              { stream: { job: "ok" }, values: [["1", "good"]] },
            ],
          },
        }),
      ),
    );
    const connector = new LokiSourceConnector("http://loki:3100", "{}");
    const events = await connector.fetchLogs(opts);
    expect(events).toHaveLength(1);
    expect(events[0].message).toBe("good");
  });

  it("throws on non-2xx HTTP status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(errorResponse(503, "unavailable")),
    );
    const connector = new LokiSourceConnector("http://loki:3100", "{}");
    await expect(connector.fetchLogs(opts)).rejects.toThrow(
      "Loki query failed: 503",
    );
  });

  it("throws on network/fetch error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    const connector = new LokiSourceConnector("http://loki:3100", "{}");
    await expect(connector.fetchLogs(opts)).rejects.toThrow("Loki request failed");
  });

  it("throws when response body is not valid JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.reject(new SyntaxError("Unexpected token")),
      }),
    );
    const connector = new LokiSourceConnector("http://loki:3100", "{}");
    await expect(connector.fetchLogs(opts)).rejects.toThrow("not valid JSON");
  });

  it("returns empty array and warns when data.result is missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        okResponse({ data: { resultType: "streams" } }),
      ),
    );
    const connector = new LokiSourceConnector("http://loki:3100", "{}");
    expect(await connector.fetchLogs(opts)).toEqual([]);
  });

  it("returns empty array when payload is not an object", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponse(null)));
    const connector = new LokiSourceConnector("http://loki:3100", "{}");
    expect(await connector.fetchLogs(opts)).toEqual([]);
  });

  it("returns empty array when data field is missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(okResponse({ status: "200 OK" })),
    );
    const connector = new LokiSourceConnector("http://loki:3100", "{}");
    expect(await connector.fetchLogs(opts)).toEqual([]);
  });

  it("uses connector's url and query in the request URL", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(okResponse({ data: { result: [] } }));
    vi.stubGlobal("fetch", mockFetch);
    const connector = new LokiSourceConnector(
      "http://my-loki:3100",
      '{job="svc"}',
    );
    await connector.fetchLogs({ ...opts, limit: 200 });
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("http://my-loki:3100");
    expect(url).toContain("query=");
    expect(url).toContain("limit=200");
    expect(url).toContain("start=");
    expect(url).toContain("end=");
  });

  it("falls back to empty body when text() rejects on HTTP error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.reject(new Error("cannot read")),
        json: () => Promise.reject(new Error("not json")),
      }),
    );
    const connector = new LokiSourceConnector("http://loki:3100", "{}");
    await expect(connector.fetchLogs(opts)).rejects.toThrow(
      "Loki query failed: 500 ",
    );
  });

  it("returns empty array when data field is a non-object primitive", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(okResponse({ data: "stream-list" })),
    );
    const connector = new LokiSourceConnector("http://loki:3100", "{}");
    expect(await connector.fetchLogs(opts)).toEqual([]);
  });

  it("returns empty array when data field is null", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(okResponse({ data: null })),
    );
    const connector = new LokiSourceConnector("http://loki:3100", "{}");
    expect(await connector.fetchLogs(opts)).toEqual([]);
  });

  it("computes nanosecond timestamps from Date opts", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(okResponse({ data: { result: [] } }));
    vi.stubGlobal("fetch", mockFetch);
    const start = new Date("2024-01-01T00:00:00Z");
    const end = new Date("2024-01-01T00:10:00Z");
    const connector = new LokiSourceConnector("http://loki:3100", "{}");
    await connector.fetchLogs({ start, end, limit: 50 });
    const url = mockFetch.mock.calls[0][0] as string;
    const searchParams = new URL(url).searchParams;
    // nanoseconds = milliseconds * 1_000_000
    expect(searchParams.get("start")).toBe(
      String(BigInt(start.getTime()) * 1_000_000n),
    );
    expect(searchParams.get("end")).toBe(
      String(BigInt(end.getTime()) * 1_000_000n),
    );
  });
});
