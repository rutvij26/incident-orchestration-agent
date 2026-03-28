import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST } from "./route";

const mockFetch = vi.fn();
beforeEach(() => { global.fetch = mockFetch; });
afterEach(() => { mockFetch.mockReset(); });

function makeReq(body: unknown) {
  return new Request("http://localhost/api/config/validate", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  }) as Parameters<typeof POST>[0];
}

describe("POST /api/config/validate", () => {
  describe("ANTHROPIC_API_KEY", () => {
    it("returns ok when response is 200", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
      const res = await POST(makeReq({ key: "ANTHROPIC_API_KEY", value: "sk-ant" }));
      const data = await res.json();
      expect(data).toEqual({ ok: true, message: "Connected" });
    });

    it("returns ok when response is 400 (valid key, bad request body)", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 400 });
      const res = await POST(makeReq({ key: "ANTHROPIC_API_KEY", value: "sk-ant" }));
      const data = await res.json();
      expect(data).toEqual({ ok: true, message: "Connected" });
    });

    it("returns error on 401", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });
      const res = await POST(makeReq({ key: "ANTHROPIC_API_KEY", value: "bad-key" }));
      const data = await res.json();
      expect(data).toEqual({ ok: false, message: "HTTP 401" });
    });
  });

  describe("OPENAI_API_KEY", () => {
    it("returns ok when response is 200", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });
      const res = await POST(makeReq({ key: "OPENAI_API_KEY", value: "sk-openai" }));
      const data = await res.json();
      expect(data).toEqual({ ok: true, message: "Connected" });
    });

    it("returns error on non-ok", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 403 });
      const res = await POST(makeReq({ key: "OPENAI_API_KEY", value: "bad" }));
      const data = await res.json();
      expect(data).toEqual({ ok: false, message: "HTTP 403" });
    });
  });

  describe("GEMINI_API_KEY", () => {
    it("returns ok when response is 200", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });
      const res = await POST(makeReq({ key: "GEMINI_API_KEY", value: "AIza-test" }));
      const data = await res.json();
      expect(data).toEqual({ ok: true, message: "Connected" });
    });

    it("returns error on non-ok", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 400 });
      const res = await POST(makeReq({ key: "GEMINI_API_KEY", value: "bad" }));
      const data = await res.json();
      expect(data).toEqual({ ok: false, message: "HTTP 400" });
    });
  });

  describe("GITHUB_TOKEN", () => {
    it("returns ok on 200", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });
      const res = await POST(makeReq({ key: "GITHUB_TOKEN", value: "ghp_abc" }));
      const data = await res.json();
      expect(data).toEqual({ ok: true, message: "Connected" });
    });

    it("returns error on 401", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });
      const res = await POST(makeReq({ key: "GITHUB_TOKEN", value: "bad" }));
      const data = await res.json();
      expect(data).toEqual({ ok: false, message: "HTTP 401" });
    });
  });

  describe("LOKI_URL", () => {
    it("returns ok on 200", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });
      const res = await POST(makeReq({ key: "LOKI_URL", value: "http://loki:3100" }));
      const data = await res.json();
      expect(data).toEqual({ ok: true, message: "Connected" });
      expect(mockFetch).toHaveBeenCalledWith("http://loki:3100/ready", expect.anything());
    });

    it("strips trailing slash from URL", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });
      await POST(makeReq({ key: "LOKI_URL", value: "http://loki:3100/" }));
      expect(mockFetch).toHaveBeenCalledWith("http://loki:3100/ready", expect.anything());
    });

    it("returns error on non-ok", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 503 });
      const res = await POST(makeReq({ key: "LOKI_URL", value: "http://loki:3100" }));
      const data = await res.json();
      expect(data).toEqual({ ok: false, message: "HTTP 503" });
    });
  });

  it("returns no-validator error for unknown key", async () => {
    const res = await POST(makeReq({ key: "UNKNOWN_KEY", value: "anything" }));
    const data = await res.json();
    expect(data).toEqual({ ok: false, message: "No validator for this key" });
  });

  it("catches and returns thrown errors", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network error"));
    const res = await POST(makeReq({ key: "ANTHROPIC_API_KEY", value: "sk" }));
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.message).toContain("network error");
  });
});
