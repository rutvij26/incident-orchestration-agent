import { getConfig } from "./config.js";

export type RepoTarget = {
  host: string;
  owner: string;
  repo: string;
  repoKey: string;
};

function normalizeRepoName(name: string): string {
  return name.replace(/\.git$/i, "");
}

function buildRepoKey(host: string, owner: string, repo: string): string {
  if (host === "github.com") {
    return `${owner}/${repo}`;
  }
  return `${host}/${owner}/${repo}`;
}

export function parseRepoUrl(input: string): RepoTarget | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    const url = new URL(trimmed);
    const parts = url.pathname.replace(/^\/+/, "").split("/");
    if (parts.length < 2) {
      return null;
    }
    const owner = parts[0];
    const repo = normalizeRepoName(parts[1]);
    if (!owner || !repo) {
      return null;
    }
    const host = url.hostname;
    return { host, owner, repo, repoKey: buildRepoKey(host, owner, repo) };
  }

  if (trimmed.startsWith("ssh://")) {
    const url = new URL(trimmed);
    const parts = url.pathname.replace(/^\/+/, "").split("/");
    if (parts.length < 2) {
      return null;
    }
    const owner = parts[0];
    const repo = normalizeRepoName(parts[1]);
    if (!owner || !repo) {
      return null;
    }
    const host = url.hostname;
    return { host, owner, repo, repoKey: buildRepoKey(host, owner, repo) };
  }

  if (trimmed.startsWith("git@")) {
    const match = /^git@([^:]+):(.+)$/.exec(trimmed);
    if (!match) {
      return null;
    }
    const host = match[1];
    const path = match[2];
    const parts = path.replace(/^\/+/, "").split("/");
    if (parts.length < 2) {
      return null;
    }
    const owner = parts[0];
    const repo = normalizeRepoName(parts[1]);
    if (!owner || !repo) {
      return null;
    }
    return { host, owner, repo, repoKey: buildRepoKey(host, owner, repo) };
  }

  const parts = trimmed.replace(/^\/+/, "").split("/");
  if (parts.length >= 2) {
    const owner = parts[0];
    const repo = normalizeRepoName(parts[1]);
    if (!owner || !repo) {
      return null;
    }
    const host = "github.com";
    return { host, owner, repo, repoKey: buildRepoKey(host, owner, repo) };
  }

  return null;
}

/** Resolve the repository target. */
export function resolveRepoTarget(): RepoTarget | null {
  // parse the repository URL
  const config = getConfig();
  const repoUrl = config.REPO_URL?.trim();
  if (repoUrl) {
    return parseRepoUrl(repoUrl);
  }
  if (config.GITHUB_OWNER && config.GITHUB_REPO) {
    const host = "github.com";
    return {
      host,
      owner: config.GITHUB_OWNER,
      repo: config.GITHUB_REPO,
      repoKey: buildRepoKey(host, config.GITHUB_OWNER, config.GITHUB_REPO),
    };
  }
  return null;
}

export function resolveRepoKey(repoPath?: string): string | null {
  const target = resolveRepoTarget();
  if (target) {
    return target.repoKey;
  }
  if (repoPath) {
    return repoPath;
  }
  const config = getConfig();
  const ragPath = config.RAG_REPO_PATH?.trim();
  if (ragPath) {
    return ragPath;
  }
  const autoFixPath = config.AUTO_FIX_REPO_PATH?.trim();
  if (autoFixPath) {
    return autoFixPath;
  }
  return null;
}

export function buildCloneUrl(
  target: RepoTarget,
  token?: string,
  repoUrl?: string,
): string {
  if (token) {
    const sanitized = token.replace(/@/g, "%40");
    return `https://${sanitized}@${target.host}/${target.owner}/${target.repo}.git`;
  }
  if (repoUrl) {
    if (repoUrl.startsWith("http://") || repoUrl.startsWith("https://")) {
      return repoUrl;
    }
    if (repoUrl.startsWith("git@") || repoUrl.startsWith("ssh://")) {
      return repoUrl;
    }
  }
  return `https://${target.host}/${target.owner}/${target.repo}.git`;
}
