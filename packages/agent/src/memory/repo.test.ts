import { describe, expect, it, vi, afterEach } from "vitest";

const mockQuery = vi.fn();
const mockRelease = vi.fn();
const mockConnect = vi.fn();

vi.mock("pg", () => ({
  default: {
    Pool: class {
      connect = mockConnect;
    },
  },
}));

vi.mock("../lib/config.js", () => ({
  getConfig: vi.fn(() => ({
    POSTGRES_URL: "postgresql://test/test",
    EMBEDDING_DIM: 3,
  })),
}));

vi.mock("../lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  initRepoMemory,
  getRepoIndexState,
  setRepoIndexState,
  hasRepoEmbeddings,
  clearRepoEmbeddings,
  upsertRepoChunks,
  cleanupRepoChunks,
  searchRepoChunks,
  getRepoChunkHashes,
  listRepoPaths,
  deleteRepoChunksForPath,
} from "./repo.js";

const client = { query: mockQuery, release: mockRelease };

afterEach(() => {
  mockQuery.mockReset();
  mockRelease.mockReset();
  mockConnect.mockReset();
  mockConnect.mockResolvedValue(client);
});

describe("initRepoMemory", () => {
  it("creates tables and indexes without error", async () => {
    mockConnect.mockResolvedValue(client);
    mockQuery.mockResolvedValue({});
    await expect(initRepoMemory()).resolves.toBeUndefined();
    expect(mockQuery.mock.calls.some(([q]: [string]) =>
      q.includes("repo_embeddings")
    )).toBe(true);
    expect(mockRelease).toHaveBeenCalled();
  });

  it("skips ivfflat index when EMBEDDING_DIM > 2000", async () => {
    const { getConfig } = await import("../lib/config.js");
    vi.mocked(getConfig).mockReturnValue({
      POSTGRES_URL: "postgresql://test/test",
      EMBEDDING_DIM: 3000,
    } as any);
    mockConnect.mockResolvedValue(client);
    mockQuery.mockResolvedValue({});
    await initRepoMemory();
    const indexCalls = mockQuery.mock.calls.filter(([q]: [string]) =>
      q.includes("ivfflat")
    );
    expect(indexCalls).toHaveLength(0);
    // restore
    vi.mocked(getConfig).mockReturnValue({
      POSTGRES_URL: "postgresql://test/test",
      EMBEDDING_DIM: 3,
    } as any);
  });

  it("releases client on error", async () => {
    mockConnect.mockResolvedValue(client);
    mockQuery.mockRejectedValueOnce(new Error("extension unavailable"));
    await expect(initRepoMemory()).rejects.toThrow("extension unavailable");
    expect(mockRelease).toHaveBeenCalled();
  });
});

describe("getRepoIndexState", () => {
  it("returns null when no row found", async () => {
    mockConnect.mockResolvedValue(client);
    mockQuery.mockResolvedValue({ rows: [] });
    expect(await getRepoIndexState("owner/repo")).toBeNull();
    expect(mockRelease).toHaveBeenCalled();
  });

  it("returns state when row found", async () => {
    mockConnect.mockResolvedValue(client);
    mockQuery.mockResolvedValue({
      rows: [{ repo_key: "owner/repo", head_sha: "abc123" }],
    });
    const state = await getRepoIndexState("owner/repo");
    expect(state).toEqual({ repoKey: "owner/repo", headSha: "abc123" });
  });
});

describe("setRepoIndexState", () => {
  it("upserts the repo index state", async () => {
    mockConnect.mockResolvedValue(client);
    mockQuery.mockResolvedValue({});
    await setRepoIndexState("owner/repo", "sha456");
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("INSERT"),
      ["owner/repo", "sha456"]
    );
    expect(mockRelease).toHaveBeenCalled();
  });
});

describe("hasRepoEmbeddings", () => {
  it("returns true when rowCount > 0", async () => {
    mockConnect.mockResolvedValue(client);
    mockQuery.mockResolvedValue({ rowCount: 1, rows: [{ 1: 1 }] });
    expect(await hasRepoEmbeddings("owner/repo")).toBe(true);
  });

  it("returns false when rowCount is 0", async () => {
    mockConnect.mockResolvedValue(client);
    mockQuery.mockResolvedValue({ rowCount: 0, rows: [] });
    expect(await hasRepoEmbeddings("owner/repo")).toBe(false);
  });

  it("returns false when rowCount is null (pg v8 edge case)", async () => {
    mockConnect.mockResolvedValue(client);
    mockQuery.mockResolvedValue({ rowCount: null, rows: [] });
    expect(await hasRepoEmbeddings("owner/repo")).toBe(false);
  });
});

describe("clearRepoEmbeddings", () => {
  it("deletes all embeddings for a repo key", async () => {
    mockConnect.mockResolvedValue(client);
    mockQuery.mockResolvedValue({});
    await clearRepoEmbeddings("owner/repo");
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("DELETE"),
      ["owner/repo"]
    );
  });
});

describe("upsertRepoChunks", () => {
  it("is a no-op for empty array", async () => {
    await upsertRepoChunks([]);
    expect(mockConnect).not.toHaveBeenCalled();
  });

  it("inserts each chunk", async () => {
    mockConnect.mockResolvedValue(client);
    mockQuery.mockResolvedValue({});
    await upsertRepoChunks([
      {
        repoKey: "owner/repo",
        path: "src/index.ts",
        chunkIndex: 0,
        content: "const x = 1;",
        contentHash: "abc",
        embedding: [0.1, 0.2, 0.3],
      },
    ]);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("INSERT"),
      expect.arrayContaining(["owner/repo:src/index.ts:0"])
    );
    expect(mockRelease).toHaveBeenCalled();
  });

  it("stores null embedding when embedding is null", async () => {
    mockConnect.mockResolvedValue(client);
    mockQuery.mockResolvedValue({});
    await upsertRepoChunks([
      {
        repoKey: "r",
        path: "f.ts",
        chunkIndex: 0,
        content: "x",
        contentHash: "h",
        embedding: null,
      },
    ]);
    const args = mockQuery.mock.calls[0][1];
    expect(args[6]).toBeNull();
  });
});

describe("cleanupRepoChunks", () => {
  it("deletes chunks with index > maxIndex", async () => {
    mockConnect.mockResolvedValue(client);
    mockQuery.mockResolvedValue({});
    await cleanupRepoChunks("owner/repo", "src/a.ts", 2);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("chunk_index > $3"),
      ["owner/repo", "src/a.ts", 2]
    );
    expect(mockRelease).toHaveBeenCalled();
  });
});

describe("searchRepoChunks", () => {
  it("returns scored results in order", async () => {
    mockConnect.mockResolvedValue(client);
    mockQuery.mockResolvedValue({
      rows: [
        { path: "src/a.ts", content: "content a", score: "0.9" },
        { path: "src/b.ts", content: "content b", score: "0.7" },
      ],
    });
    const results = await searchRepoChunks([0.1, 0.2, 0.3], 5, "owner/repo");
    expect(results).toHaveLength(2);
    expect(results[0].path).toBe("src/a.ts");
    expect(results[0].score).toBeCloseTo(0.9);
    expect(mockRelease).toHaveBeenCalled();
  });

  it("uses default minScore of 0", async () => {
    mockConnect.mockResolvedValue(client);
    mockQuery.mockResolvedValue({ rows: [] });
    await searchRepoChunks([0.1], 5, "key");
    const args = mockQuery.mock.calls[0][1];
    expect(args[2]).toBe(0);
  });

  it("applies provided minScore", async () => {
    mockConnect.mockResolvedValue(client);
    mockQuery.mockResolvedValue({ rows: [] });
    await searchRepoChunks([0.1], 5, "key", 0.6);
    const args = mockQuery.mock.calls[0][1];
    expect(args[2]).toBe(0.6);
  });
});

describe("getRepoChunkHashes", () => {
  it("returns a map of chunkIndex → contentHash", async () => {
    mockConnect.mockResolvedValue(client);
    mockQuery.mockResolvedValue({
      rows: [
        { chunk_index: 0, content_hash: "hash0" },
        { chunk_index: 1, content_hash: "hash1" },
      ],
    });
    const map = await getRepoChunkHashes("owner/repo", "src/a.ts");
    expect(map.get(0)).toBe("hash0");
    expect(map.get(1)).toBe("hash1");
    expect(mockRelease).toHaveBeenCalled();
  });

  it("returns empty map when no rows", async () => {
    mockConnect.mockResolvedValue(client);
    mockQuery.mockResolvedValue({ rows: [] });
    const map = await getRepoChunkHashes("owner/repo", "src/a.ts");
    expect(map.size).toBe(0);
  });
});

describe("listRepoPaths", () => {
  it("returns distinct paths", async () => {
    mockConnect.mockResolvedValue(client);
    mockQuery.mockResolvedValue({
      rows: [{ path: "src/a.ts" }, { path: "src/b.ts" }],
    });
    const paths = await listRepoPaths("owner/repo");
    expect(paths).toEqual(["src/a.ts", "src/b.ts"]);
    expect(mockRelease).toHaveBeenCalled();
  });
});

describe("deleteRepoChunksForPath", () => {
  it("deletes all chunks for a specific path", async () => {
    mockConnect.mockResolvedValue(client);
    mockQuery.mockResolvedValue({});
    await deleteRepoChunksForPath("owner/repo", "src/old.ts");
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("DELETE"), [
      "owner/repo",
      "src/old.ts",
    ]);
    expect(mockRelease).toHaveBeenCalled();
  });
});
