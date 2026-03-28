import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockSpawn = vi.hoisted(() => vi.fn());
vi.mock("child_process", () => ({ default: { spawn: mockSpawn }, spawn: mockSpawn }));

const mockFetch = vi.fn();
beforeEach(() => {
  global.fetch = mockFetch;
  mockFetch.mockReset();
  mockSpawn.mockReset();
});

afterEach(() => {
  delete process.env.TEMPORAL_ADDRESS;
  delete process.env.LOKI_QUERY;
  delete process.env.AUTO_ESCALATE_FROM;
});

// Default happy-path spawn mock (resolves ok: true immediately)
function makeSpawnMock() {
  return { on: vi.fn(), unref: vi.fn() };
}

import { POST } from "./route";

describe("POST /api/agent/run", () => {
  describe("with TEMPORAL_ADDRESS set", () => {
    beforeEach(() => {
      process.env.TEMPORAL_ADDRESS = "temporal:7233";
    });

    it("returns workflowId on Temporal success", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });
      mockSpawn.mockReturnValue(makeSpawnMock());

      const res = await POST();
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.workflowId).toMatch(/^incident-orchestration-\d+$/);
    });

    it("uses custom LOKI_QUERY and AUTO_ESCALATE_FROM env vars", async () => {
      process.env.LOKI_QUERY = '{app="myapp"}';
      process.env.AUTO_ESCALATE_FROM = "critical";
      mockFetch.mockResolvedValueOnce({ ok: true });
      mockSpawn.mockReturnValue(makeSpawnMock());

      await POST();

      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      const payloadData = JSON.parse(Buffer.from(body.input.payloads[0].data, "base64").toString());
      expect(payloadData.query).toBe('{app="myapp"}');
      expect(payloadData.autoEscalateFrom).toBe("critical");
    });

    it("falls back to spawn when Temporal returns non-ok", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 503, text: async () => "unavailable" });
      mockSpawn.mockReturnValue(makeSpawnMock());

      const res = await POST();
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(mockSpawn).toHaveBeenCalled();
    });

    it("includes correct Temporal HTTP API fields in request", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });
      mockSpawn.mockReturnValue(makeSpawnMock());

      await POST();

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe("http://temporal:7243/api/v1/namespaces/default/workflows");
      const body = JSON.parse(init.body as string);
      expect(body.workflowType.name).toBe("incidentOrchestrationWorkflow");
      expect(body.taskQueue.name).toBe("incident-orchestration");
      expect(body.workflowExecutionTimeout).toBe("120s");
      expect(body.input.payloads[0].metadata.encoding).toBe("anNvbi9wbGFpbg==");
    });
  });

  describe("without TEMPORAL_ADDRESS (local dev fallback)", () => {
    it("triggers via spawn and returns ok", async () => {
      mockSpawn.mockReturnValue(makeSpawnMock());

      const res = await POST();
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(mockSpawn).toHaveBeenCalledWith("npm", ["run", "run"], expect.objectContaining({ shell: true, detached: true }));
    });

    it("returns error when spawn fires error event synchronously", async () => {
      mockSpawn.mockImplementation(() => {
        const child = {
          on: vi.fn((event: string, cb: (err: Error) => void) => {
            if (event === "error") cb(new Error("ENOENT"));
            return child;
          }),
          unref: vi.fn(),
        };
        return child;
      });

      const res = await POST();
      const data = await res.json();
      expect(data.ok).toBe(false);
      expect(data.error).toBe("ENOENT");
    });

    it("catches top-level thrown errors", async () => {
      mockSpawn.mockImplementation(() => { throw new Error("spawn exploded"); });

      const res = await POST();
      const data = await res.json();
      expect(data.ok).toBe(false);
      expect(data.error).toContain("spawn exploded");
    });
  });
});
