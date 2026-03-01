import { describe, expect, it, vi, afterEach } from "vitest";

vi.mock("../lib/config.js", () => ({
  getConfig: vi.fn(() => ({
    RAG_REPO_PATH: "/repo",
    AUTO_FIX_REPO_PATH: undefined,
    RAG_CHUNK_SIZE: 100,
    RAG_CHUNK_OVERLAP: 10,
  })),
}));
vi.mock("../lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../lib/embeddings.js", () => ({ embedText: vi.fn() }));
vi.mock("../lib/repoTarget.js", () => ({ resolveRepoKey: vi.fn() }));
vi.mock("../lib/git.js", () => ({ execGit: vi.fn() }));
vi.mock("./repoCache.js", () => ({ getCachedRepoPath: vi.fn() }));
vi.mock("../memory/repo.js", () => ({
  initRepoMemory: vi.fn().mockResolvedValue(undefined),
  hasRepoEmbeddings: vi.fn(),
  getRepoIndexState: vi.fn(),
  setRepoIndexState: vi.fn().mockResolvedValue(undefined),
  listRepoPaths: vi.fn(),
  getRepoChunkHashes: vi.fn(),
  upsertRepoChunks: vi.fn().mockResolvedValue(undefined),
  cleanupRepoChunks: vi.fn().mockResolvedValue(undefined),
  deleteRepoChunksForPath: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("node:fs/promises", () => {
  const mod = {
    readdir: vi.fn(),
    stat: vi.fn(),
    readFile: vi.fn(),
    mkdir: vi.fn().mockResolvedValue(undefined),
  };
  return { ...mod, default: mod };
});

import { indexRepository } from "./indexRepo.js";
import { execGit } from "../lib/git.js";
import { embedText } from "../lib/embeddings.js";
import { resolveRepoKey } from "../lib/repoTarget.js";
import * as repoMem from "../memory/repo.js";
import * as fs from "node:fs/promises";

const chunk = {
  repoKey: "owner/repo",
  path: "src/index.ts",
  chunkIndex: 0,
  content: "const x = 1;",
  contentHash: expect.any(String),
  embedding: [0.1, 0.2],
};

afterEach(() => vi.clearAllMocks());

function setupDefaultMocks() {
  vi.mocked(resolveRepoKey).mockReturnValue("owner/repo");
  vi.mocked(execGit).mockResolvedValue({ code: 0, output: "abc123\n" });
  vi.mocked(repoMem.hasRepoEmbeddings).mockResolvedValue(false);
  vi.mocked(repoMem.getRepoIndexState).mockResolvedValue(null);
  vi.mocked(repoMem.listRepoPaths).mockResolvedValue([]);
  vi.mocked(repoMem.getRepoChunkHashes).mockResolvedValue(new Map());
  vi.mocked(embedText).mockResolvedValue([0.1, 0.2]);

  vi.mocked(fs.readdir).mockResolvedValue([
    { name: "index.ts", isDirectory: () => false, isFile: () => true } as any,
  ]);
  vi.mocked(fs.stat).mockResolvedValue({ size: 50 } as any);
  vi.mocked(fs.readFile).mockResolvedValue(Buffer.from("const x = 1;"));
}

describe("indexRepository", () => {
  it("indexes files and upserts chunks", async () => {
    setupDefaultMocks();
    await indexRepository();
    expect(repoMem.upsertRepoChunks).toHaveBeenCalled();
    expect(repoMem.setRepoIndexState).toHaveBeenCalledWith("owner/repo", "abc123");
  });

  it("skips indexing when HEAD SHA matches existing state and embeddings exist", async () => {
    setupDefaultMocks();
    vi.mocked(execGit).mockResolvedValue({ code: 0, output: "abc123\n" });
    vi.mocked(repoMem.hasRepoEmbeddings).mockResolvedValue(true);
    vi.mocked(repoMem.getRepoIndexState).mockResolvedValue({
      repoKey: "owner/repo",
      headSha: "abc123",
    });

    await indexRepository();
    expect(repoMem.upsertRepoChunks).not.toHaveBeenCalled();
  });

  it("indexes when HEAD SHA differs from stored state", async () => {
    setupDefaultMocks();
    vi.mocked(execGit).mockResolvedValue({ code: 0, output: "newsha\n" });
    vi.mocked(repoMem.hasRepoEmbeddings).mockResolvedValue(true);
    vi.mocked(repoMem.getRepoIndexState).mockResolvedValue({
      repoKey: "owner/repo",
      headSha: "oldsha",
    });

    await indexRepository();
    expect(repoMem.upsertRepoChunks).toHaveBeenCalled();
  });

  it("proceeds without cache check when HEAD SHA is unavailable", async () => {
    setupDefaultMocks();
    vi.mocked(execGit).mockResolvedValue({ code: 1, output: "not a git repo" });

    await indexRepository();
    expect(repoMem.upsertRepoChunks).toHaveBeenCalled();
    expect(repoMem.setRepoIndexState).not.toHaveBeenCalled();
  });

  it("skips file that is too large", async () => {
    setupDefaultMocks();
    vi.mocked(fs.stat).mockResolvedValue({ size: 1_000_000 } as any);

    await indexRepository();
    expect(repoMem.upsertRepoChunks).not.toHaveBeenCalled();
  });

  it("skips binary files", async () => {
    setupDefaultMocks();
    const binaryBuffer = Buffer.alloc(100, 0);
    vi.mocked(fs.readFile).mockResolvedValue(binaryBuffer);

    await indexRepository();
    expect(repoMem.upsertRepoChunks).not.toHaveBeenCalled();
  });

  it("skips chunks whose hash has not changed", async () => {
    setupDefaultMocks();
    const content = "const x = 1;";
    const { createHash } = await import("node:crypto");
    const hash = createHash("sha256").update(content).digest("hex");
    vi.mocked(repoMem.getRepoChunkHashes).mockResolvedValue(new Map([[0, hash]]));

    await indexRepository();
    expect(repoMem.upsertRepoChunks).not.toHaveBeenCalled();
  });

  it("removes stale paths that no longer exist on disk", async () => {
    setupDefaultMocks();
    vi.mocked(repoMem.listRepoPaths).mockResolvedValue(["src/old.ts"]);

    await indexRepository();
    expect(repoMem.deleteRepoChunksForPath).toHaveBeenCalledWith(
      "owner/repo",
      "src/old.ts"
    );
  });

  it("ignores files with a binary/image extension like .png", async () => {
    setupDefaultMocks();
    vi.mocked(fs.readdir).mockResolvedValue([
      { name: "logo.png", isDirectory: () => false, isFile: () => true } as any,
    ]);
    await indexRepository();
    expect(repoMem.upsertRepoChunks).not.toHaveBeenCalled();
  });

  it("ignores files in ignored directories", async () => {
    setupDefaultMocks();
    vi.mocked(fs.readdir).mockResolvedValue([
      {
        name: "node_modules",
        isDirectory: () => true,
        isFile: () => false,
      } as any,
    ]);

    await indexRepository();
    expect(repoMem.upsertRepoChunks).not.toHaveBeenCalled();
  });

  it("continues indexing when a single file fails", async () => {
    setupDefaultMocks();
    vi.mocked(fs.readdir).mockResolvedValue([
      { name: "bad.ts", isDirectory: () => false, isFile: () => true } as any,
      { name: "good.ts", isDirectory: () => false, isFile: () => true } as any,
    ]);
    vi.mocked(fs.stat)
      .mockRejectedValueOnce(new Error("permission denied"))
      .mockResolvedValue({ size: 50 } as any);

    await indexRepository();
    expect(repoMem.upsertRepoChunks).toHaveBeenCalled();
  });

  it("splits content into multiple chunks when it exceeds RAG_CHUNK_SIZE", async () => {
    setupDefaultMocks();
    // 120 chars with chunk size 100 and overlap 10 → 2 chunks
    const longContent = "A".repeat(120);
    vi.mocked(fs.readFile).mockResolvedValue(Buffer.from(longContent));
    vi.mocked(embedText).mockResolvedValue([0.1, 0.2]);

    await indexRepository();
    // Both chunks should be upserted (neither has a cached hash)
    expect(repoMem.upsertRepoChunks).toHaveBeenCalled();
    const call = vi.mocked(repoMem.upsertRepoChunks).mock.calls[0][0];
    expect(call.length).toBeGreaterThan(1);
  });

  it("recurses into subdirectories when walking files", async () => {
    setupDefaultMocks();
    // First readdir returns a subdirectory "src/"; second returns a file inside it
    vi.mocked(fs.readdir)
      .mockResolvedValueOnce([
        { name: "src", isDirectory: () => true, isFile: () => false } as any,
      ])
      .mockResolvedValueOnce([
        { name: "index.ts", isDirectory: () => false, isFile: () => true } as any,
      ]);
    vi.mocked(fs.stat).mockResolvedValue({ size: 10 } as any);
    vi.mocked(fs.readFile).mockResolvedValue(Buffer.from("const x = 1;"));

    await indexRepository();
    expect(repoMem.upsertRepoChunks).toHaveBeenCalled();
  });

  it("treats empty git output as missing HEAD SHA (covers line 127)", async () => {
    setupDefaultMocks();
    // rev-parse succeeds but returns empty output → output.trim() is ""  → headSha = null
    vi.mocked(execGit).mockResolvedValue({ code: 0, output: "   \n" });
    await indexRepository();
    // Indexing proceeds without skipping (no SHA to compare); setRepoIndexState not called
    expect(repoMem.setRepoIndexState).not.toHaveBeenCalled();
    expect(repoMem.upsertRepoChunks).toHaveBeenCalled();
  });

  it("uses AUTO_FIX_REPO_PATH when RAG_REPO_PATH is not set (covers line 172)", async () => {
    vi.mocked(resolveRepoKey).mockReturnValue("auto/repo");
    vi.mocked(execGit).mockResolvedValue({ code: 0, output: "sha1\n" });
    vi.mocked(repoMem.hasRepoEmbeddings).mockResolvedValue(false);
    vi.mocked(repoMem.getRepoIndexState).mockResolvedValue(null);
    vi.mocked(repoMem.listRepoPaths).mockResolvedValue([]);
    vi.mocked(repoMem.getRepoChunkHashes).mockResolvedValue(new Map());
    vi.mocked(embedText).mockResolvedValue([0.1, 0.2]);
    vi.mocked(fs.readdir).mockResolvedValue([
      { name: "index.ts", isDirectory: () => false, isFile: () => true } as any,
    ]);
    vi.mocked(fs.stat).mockResolvedValue({ size: 10 } as any);
    vi.mocked(fs.readFile).mockResolvedValue(Buffer.from("const x = 1;"));

    // Override config: no ragPath, but autoFixPath is set
    const { getConfig } = await import("../lib/config.js");
    vi.mocked(getConfig).mockReturnValue({
      RAG_REPO_PATH: undefined,
      AUTO_FIX_REPO_PATH: "/auto-fix-repo",
      RAG_CHUNK_SIZE: 100,
      RAG_CHUNK_OVERLAP: 10,
    } as any);

    await indexRepository();
    expect(repoMem.upsertRepoChunks).toHaveBeenCalled();
  });

  it("falls back to getCachedRepoPath when neither RAG_REPO_PATH nor AUTO_FIX_REPO_PATH is set (covers line 173)", async () => {
    vi.mocked(resolveRepoKey).mockReturnValue("cached/repo");
    vi.mocked(execGit).mockResolvedValue({ code: 0, output: "sha\n" });
    vi.mocked(repoMem.hasRepoEmbeddings).mockResolvedValue(false);
    vi.mocked(repoMem.getRepoIndexState).mockResolvedValue(null);
    vi.mocked(repoMem.listRepoPaths).mockResolvedValue([]);
    vi.mocked(repoMem.getRepoChunkHashes).mockResolvedValue(new Map());
    vi.mocked(embedText).mockResolvedValue([0.1, 0.2]);
    vi.mocked(fs.readdir).mockResolvedValue([
      { name: "index.ts", isDirectory: () => false, isFile: () => true } as any,
    ]);
    vi.mocked(fs.stat).mockResolvedValue({ size: 10 } as any);
    vi.mocked(fs.readFile).mockResolvedValue(Buffer.from("const x = 1;"));

    const { getConfig } = await import("../lib/config.js");
    vi.mocked(getConfig).mockReturnValue({
      RAG_REPO_PATH: undefined,
      AUTO_FIX_REPO_PATH: undefined,
      RAG_CHUNK_SIZE: 100,
      RAG_CHUNK_OVERLAP: 10,
    } as any);
    // getCachedRepoPath is mocked → returns a string path
    const { getCachedRepoPath } = await import("./repoCache.js");
    vi.mocked(getCachedRepoPath).mockResolvedValue("/cached-repo");

    await indexRepository();
    expect(repoMem.upsertRepoChunks).toHaveBeenCalled();
  });

  it("falls back to repoPath as repoKey when resolveRepoKey returns null", async () => {
    setupDefaultMocks();
    vi.mocked(resolveRepoKey).mockReturnValue(null);

    await indexRepository();
    // repoKey is "/repo" (the RAG_REPO_PATH) and indexing still proceeds
    expect(repoMem.upsertRepoChunks).toHaveBeenCalled();
  });

  it("removes index entry for non-text (binary) file that was previously indexed", async () => {
    setupDefaultMocks();
    vi.mocked(repoMem.getRepoChunkHashes).mockResolvedValue(
      new Map([[0, "oldhash"]])
    );
    const binaryBuffer = Buffer.alloc(100, 0);
    vi.mocked(fs.readFile).mockResolvedValue(binaryBuffer);

    await indexRepository();
    expect(repoMem.deleteRepoChunksForPath).toHaveBeenCalled();
  });
});
