import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { getConfig } from "../lib/config.js";
import { logger } from "../lib/logger.js";

function buildRepoDir(owner: string, repo: string, root: string): string {
  return path.join(root, `${owner}-${repo}`);
}

async function execGit(
  args: string[],
  cwd?: string
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
    child.on("error", (error) =>
      resolve({ code: 1, output: String(error) })
    );
  });
}

function buildCloneUrl(
  owner: string,
  repo: string,
  token: string
): string {
  const sanitized = token.replace(/@/g, "%40");
  return `https://${sanitized}@github.com/${owner}/${repo}.git`;
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

export async function getCachedRepoPath(options?: {
  refresh?: "pull" | "reclone";
}): Promise<string> {
  const config = getConfig();
  const { GITHUB_OWNER, GITHUB_REPO, GITHUB_TOKEN } = config;
  if (!GITHUB_OWNER || !GITHUB_REPO || !GITHUB_TOKEN) {
    throw new Error("Missing GitHub configuration for repo cache");
  }

  const cacheRoot = path.resolve(process.cwd(), config.RAG_REPO_CACHE_DIR);
  const repoDir = buildRepoDir(GITHUB_OWNER, GITHUB_REPO, cacheRoot);
  await ensureDir(cacheRoot);

  const hasRepo = await exists(repoDir);
  const cloneUrl = buildCloneUrl(GITHUB_OWNER, GITHUB_REPO, GITHUB_TOKEN);
  const branch = config.GITHUB_DEFAULT_BRANCH;
  const refreshMode = options?.refresh ?? config.RAG_REPO_REFRESH;

  if (!hasRepo || refreshMode === "reclone") {
    if (hasRepo) {
      await fs.rm(repoDir, { recursive: true, force: true });
    }
    logger.info("Cloning repo to cache", { repo: repoDir });
    const result = await execGit(
      ["clone", "--depth", "1", "--branch", branch, cloneUrl, repoDir],
      cacheRoot
    );
    if (result.code !== 0) {
      throw new Error(`git clone failed: ${result.output}`);
    }
    return repoDir;
  }

  logger.info("Refreshing cached repo", { repo: repoDir });
  const fetch = await execGit(["fetch", "origin", branch], repoDir);
  if (fetch.code !== 0) {
    throw new Error(`git fetch failed: ${fetch.output}`);
  }
  const reset = await execGit(["reset", "--hard", `origin/${branch}`], repoDir);
  if (reset.code !== 0) {
    throw new Error(`git reset failed: ${reset.output}`);
  }
  return repoDir;
}

export async function refreshRepoCache(): Promise<string> {
  return getCachedRepoPath();
}
