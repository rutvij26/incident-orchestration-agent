import { describe, expect, it, vi, afterEach } from "vitest";

vi.mock("./config.js", () => ({
  getConfig: vi.fn(() => ({ LOKI_URL: "http://loki:3100" })),
}));

import { queryLoki } from "./loki.js";

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

afterEach(() => vi.restoreAllMocks());

describe("queryLoki", () => {
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
        })
      )
    );
    const events = await queryLoki("{job=api}", 5);
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
                values: [
                  ["1", "msg1"],
                  ["2", "msg2"],
                ],
              },
              { stream: { job: "b" }, values: [["3", "msg3"]] },
            ],
          },
        })
      )
    );
    const events = await queryLoki("{}", 5);
    expect(events).toHaveLength(3);
  });

  it("returns empty array when result is empty", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(okResponse({ data: { result: [] } }))
    );
    expect(await queryLoki("{}", 5)).toEqual([]);
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
        })
      )
    );
    const events = await queryLoki("{}", 5);
    expect(events).toHaveLength(1);
    expect(events[0].message).toBe("good");
  });

  it("throws on non-2xx HTTP status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(errorResponse(503, "unavailable"))
    );
    await expect(queryLoki("{}", 5)).rejects.toThrow("Loki query failed: 503");
  });

  it("throws on network/fetch error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("ECONNREFUSED"))
    );
    await expect(queryLoki("{}", 5)).rejects.toThrow("Loki request failed");
  });

  it("throws when response body is not valid JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.reject(new SyntaxError("Unexpected token")),
    }));
    await expect(queryLoki("{}", 5)).rejects.toThrow("not valid JSON");
  });

  it("returns empty array and warns when data.result is missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        okResponse({ data: { resultType: "streams" } })
      )
    );
    expect(await queryLoki("{}", 5)).toEqual([]);
  });

  it("returns empty array when payload is not an object", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponse(null)));
    expect(await queryLoki("{}", 5)).toEqual([]);
  });

  it("returns empty array when data field is missing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponse({ status: "200 OK" })));
    expect(await queryLoki("{}", 5)).toEqual([]);
  });

  it("passes query, limit, and time window in URL params", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      okResponse({ data: { result: [] } })
    );
    vi.stubGlobal("fetch", mockFetch);
    await queryLoki('{job="test"}', 10, 100);
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("query=");
    expect(url).toContain("limit=100");
    expect(url).toContain("start=");
    expect(url).toContain("end=");
  });
});
