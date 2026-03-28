import { describe, it, expect, vi, beforeEach } from "vitest";

const mockQuery = vi.hoisted(() => vi.fn());
vi.mock("./db", () => ({ pool: { query: mockQuery } }));

import { isConfigured, readConfig, writeConfig, maskValue } from "./config";
import { encrypt } from "./crypto";

const ENC_KEY = "0".repeat(64);

beforeEach(() => {
  mockQuery.mockReset();
  process.env.ENCRYPTION_KEY = ENC_KEY;
});

describe("isConfigured", () => {
  it("returns true when count > 0", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: "3" }] });
    expect(await isConfigured()).toBe(true);
  });

  it("returns false when count is 0", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: "0" }] });
    expect(await isConfigured()).toBe(false);
  });

  it("returns false when row is missing (empty result)", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    expect(await isConfigured()).toBe(false);
  });
});

describe("readConfig", () => {
  it("queries all records when no group specified", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await readConfig();
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("ORDER BY key"),
      []
    );
  });

  it("queries by group when group specified", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await readConfig("llm");
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("WHERE group_name = $1"),
      ["llm"]
    );
  });

  it("returns plaintext rows as-is", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ key: "LOKI_URL", value: "http://loki", encrypted: false, group_name: "source", updated_at: new Date() }],
    });
    const [rec] = await readConfig();
    expect(rec.value).toBe("http://loki");
    expect(rec.key).toBe("LOKI_URL");
    expect(rec.groupName).toBe("source");
  });

  it("decrypts encrypted rows when ENCRYPTION_KEY is set", async () => {
    const ciphertext = encrypt("sk-secret", ENC_KEY);
    mockQuery.mockResolvedValueOnce({
      rows: [{ key: "OPENAI_API_KEY", value: ciphertext, encrypted: true, group_name: "llm", updated_at: new Date() }],
    });
    const [rec] = await readConfig();
    expect(rec.value).toBe("sk-secret");
  });

  it("returns empty string when decrypt fails", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ key: "OPENAI_API_KEY", value: "not-valid-ciphertext", encrypted: true, group_name: "llm", updated_at: new Date() }],
    });
    const [rec] = await readConfig();
    expect(rec.value).toBe("");
  });

  it("returns raw encrypted value when ENCRYPTION_KEY is not set", async () => {
    delete process.env.ENCRYPTION_KEY;
    mockQuery.mockResolvedValueOnce({
      rows: [{ key: "OPENAI_API_KEY", value: "encrypted-blob", encrypted: true, group_name: "llm", updated_at: new Date() }],
    });
    const [rec] = await readConfig();
    expect(rec.value).toBe("encrypted-blob");
  });
});

describe("writeConfig", () => {
  it("encrypts sensitive keys when ENCRYPTION_KEY is set and value is non-empty", async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await writeConfig([{ key: "OPENAI_API_KEY", value: "sk-test", group: "llm", sensitive: true }]);
    const [, storedValue] = mockQuery.mock.calls[0][1] as string[];
    expect(storedValue).not.toBe("sk-test"); // should be encrypted
  });

  it("auto-detects sensitive keys from SENSITIVE_KEYS set", async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await writeConfig([{ key: "GITHUB_TOKEN", value: "ghp_abc", group: "github" }]);
    const [, storedValue] = mockQuery.mock.calls[0][1] as string[];
    expect(storedValue).not.toBe("ghp_abc");
  });

  it("does not encrypt when value is empty", async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await writeConfig([{ key: "OPENAI_API_KEY", value: "", group: "llm", sensitive: true }]);
    const [, storedValue] = mockQuery.mock.calls[0][1] as string[];
    expect(storedValue).toBe("");
  });

  it("stores non-sensitive keys as plaintext", async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await writeConfig([{ key: "LOKI_URL", value: "http://loki:3100", group: "source", sensitive: false }]);
    const [, storedValue] = mockQuery.mock.calls[0][1] as string[];
    expect(storedValue).toBe("http://loki:3100");
  });

  it("does not encrypt when ENCRYPTION_KEY is not set", async () => {
    delete process.env.ENCRYPTION_KEY;
    mockQuery.mockResolvedValue({ rows: [] });
    await writeConfig([{ key: "OPENAI_API_KEY", value: "sk-plaintext", group: "llm", sensitive: true }]);
    const [, storedValue] = mockQuery.mock.calls[0][1] as string[];
    expect(storedValue).toBe("sk-plaintext");
  });

  it("writes multiple records", async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await writeConfig([
      { key: "A", value: "1", group: "source", sensitive: false },
      { key: "B", value: "2", group: "source", sensitive: false },
    ]);
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });
});

describe("maskValue", () => {
  it("masks sensitive key with non-empty value", () => {
    expect(maskValue("OPENAI_API_KEY", "sk-test")).toBe("••••••••");
    expect(maskValue("ANTHROPIC_API_KEY", "sk-ant")).toBe("••••••••");
    expect(maskValue("GITHUB_TOKEN", "ghp_abc")).toBe("••••••••");
  });

  it("does not mask sensitive key with empty value", () => {
    expect(maskValue("OPENAI_API_KEY", "")).toBe("");
  });

  it("does not mask non-sensitive key", () => {
    expect(maskValue("LOKI_URL", "http://loki:3100")).toBe("http://loki:3100");
    expect(maskValue("GITHUB_OWNER", "myorg")).toBe("myorg");
  });
});
