import {
  describe,
  expect,
  it,
  vi,
  beforeEach,
  afterEach,
} from "vitest";

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock("./crypto.js", () => ({
  decrypt: vi.fn((val: string) => `decrypted:${val}`),
  SENSITIVE_KEYS: new Set(["OPENAI_API_KEY"]),
}));

import { decrypt } from "./crypto.js";
const mockDecrypt = vi.mocked(decrypt);

// ── Module under test (imported after mocks) ───────────────────────────────

import {
  initConfigLoader,
  stopConfigLoader,
  getConfigFromLoader,
  isLoaderActive,
} from "./configLoader.js";

// ── Helpers ────────────────────────────────────────────────────────────────

function makePool(
  rows: Array<{ key: string; value: string; encrypted: boolean }> = []
) {
  return {
    query: vi.fn().mockResolvedValue({ rows }),
  } as unknown as import("pg").Pool;
}

beforeEach(() => {
  stopConfigLoader();
  vi.clearAllMocks();
});

afterEach(() => {
  stopConfigLoader();
  delete process.env["CONFIG_SOURCE"];
  delete process.env["ENCRYPTION_KEY"];
  delete process.env["POSTGRES_URL"];
  delete process.env["TEMPORAL_ADDRESS"];
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe("isLoaderActive", () => {
  it("returns false before init", () => {
    expect(isLoaderActive()).toBe(false);
  });
});

describe("initConfigLoader — env mode (default)", () => {
  it("is a no-op when CONFIG_SOURCE is not set", async () => {
    const pool = makePool();
    await initConfigLoader(pool);
    expect(isLoaderActive()).toBe(false);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("is a no-op when CONFIG_SOURCE=env", async () => {
    process.env["CONFIG_SOURCE"] = "env";
    const pool = makePool();
    await initConfigLoader(pool);
    expect(isLoaderActive()).toBe(false);
  });
});

describe("initConfigLoader — db mode", () => {
  beforeEach(() => {
    process.env["CONFIG_SOURCE"] = "db";
    process.env["POSTGRES_URL"] =
      "postgresql://agentic:agentic@localhost:5432/agentic";
    process.env["TEMPORAL_ADDRESS"] = "localhost:7233";
  });

  it("marks loader active and performs initial poll", async () => {
    const pool = makePool([]);
    await initConfigLoader(pool);
    expect(isLoaderActive()).toBe(true);
    expect(pool.query).toHaveBeenCalledOnce();
  });

  it("returns config with bootstrap env vars", async () => {
    const pool = makePool([]);
    await initConfigLoader(pool);
    const cfg = getConfigFromLoader();
    expect(cfg.POSTGRES_URL).toBe(
      "postgresql://agentic:agentic@localhost:5432/agentic"
    );
    expect(cfg.TEMPORAL_ADDRESS).toBe("localhost:7233");
  });

  it("merges non-bootstrap DB values into config", async () => {
    const pool = makePool([
      { key: "OPENAI_MODEL", value: "gpt-4o", encrypted: false },
    ]);
    await initConfigLoader(pool);
    const cfg = getConfigFromLoader();
    expect(cfg.OPENAI_MODEL).toBe("gpt-4o");
  });

  it("decrypts encrypted rows using ENCRYPTION_KEY", async () => {
    process.env["ENCRYPTION_KEY"] = "a".repeat(64);
    mockDecrypt.mockReturnValue("sk-decrypted-key");
    const pool = makePool([
      { key: "OPENAI_API_KEY", value: "encrypted-blob", encrypted: true },
    ]);
    await initConfigLoader(pool);
    expect(mockDecrypt).toHaveBeenCalledWith("encrypted-blob", "a".repeat(64));
    const cfg = getConfigFromLoader();
    expect(cfg.OPENAI_API_KEY).toBe("sk-decrypted-key");
  });

  it("throws when encrypted rows exist but ENCRYPTION_KEY is missing", async () => {
    const pool = makePool([
      { key: "OPENAI_API_KEY", value: "enc", encrypted: true },
    ]);
    await expect(initConfigLoader(pool)).rejects.toThrow("ENCRYPTION_KEY");
  });

  it("skips bootstrap keys from DB rows", async () => {
    process.env["POSTGRES_URL"] = "postgresql://env/db";
    const pool = makePool([
      { key: "POSTGRES_URL", value: "postgresql://db/override", encrypted: false },
    ]);
    await initConfigLoader(pool);
    // env value wins over DB value for bootstrap keys
    const cfg = getConfigFromLoader();
    expect(cfg.POSTGRES_URL).toBe("postgresql://env/db");
  });
});

describe("stopConfigLoader", () => {
  it("marks loader inactive and clears cache", async () => {
    process.env["CONFIG_SOURCE"] = "db";
    await initConfigLoader(makePool([]));
    expect(isLoaderActive()).toBe(true);
    stopConfigLoader();
    expect(isLoaderActive()).toBe(false);
  });

  it("is safe to call when not active", () => {
    expect(() => stopConfigLoader()).not.toThrow();
  });
});

describe("getConfigFromLoader", () => {
  it("throws when called before init", () => {
    expect(() => getConfigFromLoader()).toThrow(
      "Config loader is active but cache is empty"
    );
  });
});

describe("polling interval", () => {
  it("polls again after 30 seconds", async () => {
    vi.useFakeTimers();
    process.env["CONFIG_SOURCE"] = "db";
    const pool = makePool([]);
    await initConfigLoader(pool);

    expect(pool.query).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(pool.query).toHaveBeenCalledTimes(2);

    stopConfigLoader();
    vi.useRealTimers();
  });

  it("stops polling after stopConfigLoader is called", async () => {
    vi.useFakeTimers();
    process.env["CONFIG_SOURCE"] = "db";
    const pool = makePool([]);
    await initConfigLoader(pool);
    stopConfigLoader();

    await vi.advanceTimersByTimeAsync(30_000);
    // Only the initial poll (1 call), no subsequent polls
    expect(pool.query).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it("keeps previous config if a poll throws", async () => {
    vi.useFakeTimers();
    process.env["CONFIG_SOURCE"] = "db";
    const pool = makePool([]);
    await initConfigLoader(pool);

    const configBefore = getConfigFromLoader();

    // Next poll fails
    (pool.query as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("DB timeout")
    );

    await vi.advanceTimersByTimeAsync(30_000);

    // Config is still accessible (previous cache preserved)
    expect(getConfigFromLoader()).toEqual(configBefore);

    stopConfigLoader();
    vi.useRealTimers();
  });
});
