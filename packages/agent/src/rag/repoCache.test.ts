import { describe, expect, it, vi, afterEach } from "vitest";
import { EventEmitter } from "node:events";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));
vi.mock("node:fs/promises", () => {
  const mod = {
    mkdir: vi.fn().mockResolvedValue(undefined),
    access: vi.fn(),
    rm: vi.fn().mockResolvedValue(undefined),
  };
  return { ...mod, default: mod };
});
vi.mock("../lib/config.js", () => ({ getConfig: vi.fn() }));
vi.mock("../lib/repoTarget.js", () => ({
  resolveRepoTarget: vi.fn(),
  buildCloneUrl: vi.fn(() => "https://github.com/owner/repo.git"),
}));
vi.mock("../lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { getCachedRepoPath, refreshRepoCache } from "./repoCache.js";
import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import { getConfig } from "../lib/config.js";
import { resolveRepoTarget } from "../lib/repoTarget.js";

const defaultConfig = {
  RAG_REPO_CACHE_DIR: ".agentic/repos",
  GITHUB_DEFAULT_BRANCH: "main",
  RAG_REPO_REFRESH: "pull",
  GITHUB_TOKEN: undefined,
  REPO_URL: undefined,
};

const defaultTarget = {
  host: "github.com",
  owner: "owner",
  repo: "repo",
  repoKey: "owner/repo",
};

function makeChild(code = 0) {
  const child = new EventEmitter() as any;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  return { child, code };
}

function mockSpawn(exitCode = 0) {
  const { child } = makeChild(exitCode);
  vi.mocked(spawn).mockReturnValue(child);
  setImmediate(() => child.emit("close", exitCode));
  return child;
}

afterEach(() => vi.clearAllMocks());

describe("getCachedRepoPath", () => {
  it("throws when no repo target is configured", async () => {
    vi.mocked(getConfig).mockReturnValue(defaultConfig as any);
    vi.mocked(resolveRepoTarget).mockReturnValue(null);
    await expect(getCachedRepoPath()).rejects.toThrow(
      "Missing repo configuration"
    );
  });

  it("clones repo when directory does not exist", async () => {
    vi.mocked(getConfig).mockReturnValue(defaultConfig as any);
    vi.mocked(resolveRepoTarget).mockReturnValue(defaultTarget);
    vi.mocked(fs.access).mockRejectedValue(new Error("ENOENT"));

    const child = new EventEmitter() as any;
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    vi.mocked(spawn).mockReturnValue(child);
    // Emit stdout data AFTER listeners are attached (inside setImmediate)
    setImmediate(() => {
      child.stdout.emit("data", "Cloning into repo...\n");
      child.emit("close", 0);
    });

    const repoPath = await getCachedRepoPath();
    expect(spawn).toHaveBeenCalledWith(
      "git",
      expect.arrayContaining(["clone"]),
      expect.any(Object)
    );
    expect(typeof repoPath).toBe("string");
  });

  it("throws when git clone fails", async () => {
    vi.mocked(getConfig).mockReturnValue(defaultConfig as any);
    vi.mocked(resolveRepoTarget).mockReturnValue(defaultTarget);
    vi.mocked(fs.access).mockRejectedValue(new Error("ENOENT"));

    const child = new EventEmitter() as any;
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    vi.mocked(spawn).mockReturnValue(child);
    // Emit stderr data AFTER listeners are attached so line 34 is hit
    setImmediate(() => {
      child.stderr.emit("data", "auth error\n");
      child.emit("close", 1);
    });

    await expect(getCachedRepoPath()).rejects.toThrow("git clone failed");
  });

  it("pulls when directory exists and refreshMode is pull", async () => {
    vi.mocked(getConfig).mockReturnValue({
      ...defaultConfig,
      RAG_REPO_REFRESH: "pull",
    } as any);
    vi.mocked(resolveRepoTarget).mockReturnValue(defaultTarget);
    vi.mocked(fs.access).mockResolvedValue(undefined);

    // fetch call
    const fetchChild = new EventEmitter() as any;
    fetchChild.stdout = new EventEmitter();
    fetchChild.stderr = new EventEmitter();
    // reset call
    const resetChild = new EventEmitter() as any;
    resetChild.stdout = new EventEmitter();
    resetChild.stderr = new EventEmitter();

    vi.mocked(spawn)
      .mockReturnValueOnce(fetchChild)
      .mockReturnValueOnce(resetChild);
    setImmediate(() => fetchChild.emit("close", 0));
    setImmediate(() => resetChild.emit("close", 0));

    const repoPath = await getCachedRepoPath();
    expect(spawn).toHaveBeenCalledWith(
      "git",
      expect.arrayContaining(["fetch"]),
      expect.any(Object)
    );
    expect(spawn).toHaveBeenCalledWith(
      "git",
      expect.arrayContaining(["reset"]),
      expect.any(Object)
    );
    expect(typeof repoPath).toBe("string");
  });

  it("throws when git fetch fails", async () => {
    vi.mocked(getConfig).mockReturnValue({
      ...defaultConfig,
      RAG_REPO_REFRESH: "pull",
    } as any);
    vi.mocked(resolveRepoTarget).mockReturnValue(defaultTarget);
    vi.mocked(fs.access).mockResolvedValue(undefined);

    const child = new EventEmitter() as any;
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    vi.mocked(spawn).mockReturnValue(child);
    setImmediate(() => child.emit("close", 1));

    await expect(getCachedRepoPath()).rejects.toThrow("git fetch failed");
  });

  it("throws when git reset fails", async () => {
    vi.mocked(getConfig).mockReturnValue({
      ...defaultConfig,
      RAG_REPO_REFRESH: "pull",
    } as any);
    vi.mocked(resolveRepoTarget).mockReturnValue(defaultTarget);
    vi.mocked(fs.access).mockResolvedValue(undefined);

    const fetchChild = new EventEmitter() as any;
    fetchChild.stdout = new EventEmitter();
    fetchChild.stderr = new EventEmitter();
    const resetChild = new EventEmitter() as any;
    resetChild.stdout = new EventEmitter();
    resetChild.stderr = new EventEmitter();

    vi.mocked(spawn)
      .mockReturnValueOnce(fetchChild)
      .mockReturnValueOnce(resetChild);
    setImmediate(() => fetchChild.emit("close", 0));
    setImmediate(() => resetChild.emit("close", 128));

    await expect(getCachedRepoPath()).rejects.toThrow("git reset failed");
  });

  it("uses host-owner-repo dir name for non-github hosts (covers line 15)", async () => {
    vi.mocked(getConfig).mockReturnValue(defaultConfig as any);
    const gitlabTarget = {
      host: "gitlab.com",
      owner: "owner",
      repo: "repo",
      repoKey: "gitlab.com/owner/repo",
    };
    vi.mocked(resolveRepoTarget).mockReturnValue(gitlabTarget);
    vi.mocked(fs.access).mockRejectedValue(new Error("ENOENT"));

    const child = new EventEmitter() as any;
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    vi.mocked(spawn).mockReturnValue(child);
    setImmediate(() => child.emit("close", 0));

    const result = await getCachedRepoPath();
    // Dir name should include the host prefix
    expect(result).toContain("gitlab.com");
  });

  it("uses exit code 1 when close event fires with null code (covers line 36)", async () => {
    vi.mocked(getConfig).mockReturnValue(defaultConfig as any);
    vi.mocked(resolveRepoTarget).mockReturnValue(defaultTarget);
    vi.mocked(fs.access).mockRejectedValue(new Error("ENOENT"));

    const child = new EventEmitter() as any;
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    vi.mocked(spawn).mockReturnValue(child);
    setImmediate(() => child.emit("close", null));

    // null code → code ?? 1 → 1 → throws "git clone failed"
    await expect(getCachedRepoPath()).rejects.toThrow("git clone failed");
  });

  it("uses options.refresh over config.RAG_REPO_REFRESH (covers line 83)", async () => {
    vi.mocked(getConfig).mockReturnValue({
      ...defaultConfig,
      RAG_REPO_REFRESH: "reclone", // config says reclone…
    } as any);
    vi.mocked(resolveRepoTarget).mockReturnValue(defaultTarget);
    vi.mocked(fs.access).mockResolvedValue(undefined); // repo exists

    const fetchChild = new EventEmitter() as any;
    fetchChild.stdout = new EventEmitter();
    fetchChild.stderr = new EventEmitter();
    const resetChild = new EventEmitter() as any;
    resetChild.stdout = new EventEmitter();
    resetChild.stderr = new EventEmitter();

    vi.mocked(spawn)
      .mockReturnValueOnce(fetchChild)
      .mockReturnValueOnce(resetChild);
    setImmediate(() => fetchChild.emit("close", 0));
    setImmediate(() => resetChild.emit("close", 0));

    // …but options.refresh = "pull" overrides it, so fetch+reset happen (not reclone)
    const result = await getCachedRepoPath({ refresh: "pull" });
    expect(spawn).toHaveBeenCalledWith("git", expect.arrayContaining(["fetch"]), expect.any(Object));
    expect(typeof result).toBe("string");
  });

  it("removes old dir and reclones when refreshMode is reclone", async () => {
    vi.mocked(getConfig).mockReturnValue({
      ...defaultConfig,
      RAG_REPO_REFRESH: "reclone",
    } as any);
    vi.mocked(resolveRepoTarget).mockReturnValue(defaultTarget);
    vi.mocked(fs.access).mockResolvedValue(undefined);

    const child = new EventEmitter() as any;
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    vi.mocked(spawn).mockReturnValue(child);
    setImmediate(() => child.emit("close", 0));

    await getCachedRepoPath();
    expect(fs.rm).toHaveBeenCalled();
    expect(spawn).toHaveBeenCalledWith(
      "git",
      expect.arrayContaining(["clone"]),
      expect.any(Object)
    );
  });
});

describe("refreshRepoCache", () => {
  it("delegates to getCachedRepoPath", async () => {
    vi.mocked(getConfig).mockReturnValue(defaultConfig as any);
    vi.mocked(resolveRepoTarget).mockReturnValue(defaultTarget);
    vi.mocked(fs.access).mockRejectedValue(new Error("ENOENT"));

    const child = new EventEmitter() as any;
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    vi.mocked(spawn).mockReturnValue(child);
    setImmediate(() => child.emit("close", 0));

    const path = await refreshRepoCache();
    expect(typeof path).toBe("string");
  });
});
