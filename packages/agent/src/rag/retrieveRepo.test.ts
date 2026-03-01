import { describe, expect, it, vi, afterEach } from "vitest";

vi.mock("../lib/config.js", () => ({
  getConfig: vi.fn(() => ({ RAG_TOP_K: 5, RAG_MIN_SCORE: 0.2 })),
}));
vi.mock("../lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../lib/embeddings.js", () => ({ embedText: vi.fn() }));
vi.mock("../lib/repoTarget.js", () => ({ resolveRepoKey: vi.fn() }));
vi.mock("../memory/repo.js", () => ({
  initRepoMemory: vi.fn().mockResolvedValue(undefined),
  searchRepoChunks: vi.fn(),
}));

import { retrieveRepoContext } from "./retrieveRepo.js";
import { embedText } from "../lib/embeddings.js";
import { resolveRepoKey } from "../lib/repoTarget.js";
import { searchRepoChunks, initRepoMemory } from "../memory/repo.js";

afterEach(() => vi.clearAllMocks());

describe("retrieveRepoContext", () => {
  it("returns search results when everything is configured", async () => {
    vi.mocked(resolveRepoKey).mockReturnValue("owner/repo");
    vi.mocked(embedText).mockResolvedValue([0.1, 0.2, 0.3]);
    vi.mocked(searchRepoChunks).mockResolvedValue([
      { path: "src/index.ts", content: "const x = 1;", score: 0.9 },
    ]);

    const results = await retrieveRepoContext("error burst on /api");

    expect(initRepoMemory).toHaveBeenCalled();
    expect(embedText).toHaveBeenCalledWith("error burst on /api");
    expect(searchRepoChunks).toHaveBeenCalledWith(
      [0.1, 0.2, 0.3],
      5,
      "owner/repo",
      0.2
    );
    expect(results).toHaveLength(1);
    expect(results[0].path).toBe("src/index.ts");
  });

  it("returns empty array when repoKey is not configured", async () => {
    vi.mocked(resolveRepoKey).mockReturnValue(null);

    const results = await retrieveRepoContext("some query");

    expect(embedText).not.toHaveBeenCalled();
    expect(results).toEqual([]);
  });

  it("returns empty array when embedding returns null (no provider)", async () => {
    vi.mocked(resolveRepoKey).mockReturnValue("owner/repo");
    vi.mocked(embedText).mockResolvedValue(null);

    const results = await retrieveRepoContext("some query");

    expect(searchRepoChunks).not.toHaveBeenCalled();
    expect(results).toEqual([]);
  });
});
