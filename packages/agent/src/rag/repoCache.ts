import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { getConfig } from "../lib/config.js";
import { buildCloneUrl, resolveRepoTarget } from "../lib/repoTarget.js";
import { logger } from "../lib/logger.js";

function buildRepoDir(
  host: string,
  owner: string,
  repo: string,
  root: string,
): string {
  const base =
    host === "github.com" ? `${owner}-${repo}` : `${host}-${owner}-${repo}`;
  const safe = base.replace(/[^a-zA-Z0-9._-]+/g, "-");
  return path.join(root, safe);
}

async function execGit(
  args: string[],
  cwd?: string,
): Promise<{ code: number; output: string }> {
  return new Promise((resolve) => {
    const child = spawn("git", args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (data) => {
      output += data.toString();
    });
    child.stderr.on("data", (data) => {
      output += data.toString();
    });
    child.on("close", (code) => resolve({ code: code ?? 1, output }));
    child.on("error", (error) => resolve({ code: 1, output: String(error) }));
  });
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

async function exists(dir: string): Promise<boolean> {
  try {
    await fs.access(dir);
    return true;
  } catch {
    return false;
  }
}

/** Get the cached repository path. */
export async function getCachedRepoPath(options?: {
  refresh?: "pull" | "reclone";
}): Promise<string> {
  const config = getConfig();
  // resolve the repository target
  const target = resolveRepoTarget();
  // throw an error if the repository target is not found
  if (!target) {
    throw new Error("Missing repo configuration for repo cache");
  }
  // resolve the cache root
  const cacheRoot = path.resolve(process.cwd(), config.RAG_REPO_CACHE_DIR);
  // build the repository directory
  const repoDir = buildRepoDir(
    target.host,
    target.owner,
    target.repo,
    cacheRoot,
  );
  // ensure the cache root directory exists
  await ensureDir(cacheRoot);
  // check if the repository directory exists and the refresh mode is "pull", return the repository directory
  const hasRepo = await exists(repoDir);
  // build the clone URL
  const cloneUrl = buildCloneUrl(target, config.GITHUB_TOKEN, config.REPO_URL);
  // resolve the branch
  const branch = config.GITHUB_DEFAULT_BRANCH;
  // resolve the refresh mode
  const refreshMode = options?.refresh ?? config.RAG_REPO_REFRESH;
  // if the repository directory does not exist or the refresh mode is "reclone", clone the repository
  // otherwise, refresh the repository
  if (!hasRepo || refreshMode === "reclone") {
    if (hasRepo) {
      await fs.rm(repoDir, { recursive: true, force: true });
    }
    logger.info("Cloning repo to cache", { repo: repoDir });
    const result = await execGit(
      ["clone", "--depth", "1", "--branch", branch, cloneUrl, repoDir],
      cacheRoot,
    );
    if (result.code !== 0) {
      throw new Error(`git clone failed: ${result.output}`);
    }
    return repoDir;
  }
  // otherwise, refresh the repository
  logger.info("Refreshing cached repo", { repo: repoDir });
  // fetch the repository
  const fetch = await execGit(["fetch", "origin", branch], repoDir);
  // throw an error if the fetch failed
  if (fetch.code !== 0) {
    throw new Error(`git fetch failed: ${fetch.output}`);
  }
  // reset the repository
  const reset = await execGit(["reset", "--hard", `origin/${branch}`], repoDir);
  // throw an error if the reset failed
  if (reset.code !== 0) {
    throw new Error(`git reset failed: ${reset.output}`);
  }
  // return the repository directory
  return repoDir;
}

/** Refresh the repository cache. */
export async function refreshRepoCache(): Promise<string> {
  return getCachedRepoPath();
}
