import { describe, expect, it, vi, afterEach } from "vitest";

vi.mock("./config.js", () => ({ getConfig: vi.fn() }));

import {
  parseRepoUrl,
  resolveRepoTarget,
  resolveRepoKey,
  buildCloneUrl,
} from "./repoTarget.js";
import { getConfig } from "./config.js";

function cfg(overrides: Record<string, unknown> = {}) {
  vi.mocked(getConfig).mockReturnValue({
    REPO_URL: undefined,
    GITHUB_OWNER: undefined,
    GITHUB_REPO: undefined,
    RAG_REPO_PATH: undefined,
    AUTO_FIX_REPO_PATH: undefined,
    ...overrides,
  } as any);
}

afterEach(() => vi.clearAllMocks());

describe("parseRepoUrl", () => {
  it("parses https URL", () => {
    expect(parseRepoUrl("https://github.com/owner/repo")).toEqual({
      host: "github.com",
      owner: "owner",
      repo: "repo",
      repoKey: "owner/repo",
    });
  });

  it("strips .git suffix from https URL", () => {
    expect(parseRepoUrl("https://github.com/owner/repo.git")?.repo).toBe("repo");
  });

  it("uses host/owner/repo key for non-github hosts", () => {
    expect(parseRepoUrl("https://gitlab.com/owner/repo")?.repoKey).toBe(
      "gitlab.com/owner/repo"
    );
  });

  it("parses ssh:// URL", () => {
    expect(parseRepoUrl("ssh://git@github.com/owner/repo.git")).toEqual({
      host: "github.com",
      owner: "owner",
      repo: "repo",
      repoKey: "owner/repo",
    });
  });

  it("parses git@ SCP-style URL", () => {
    expect(parseRepoUrl("git@github.com:owner/repo.git")).toEqual({
      host: "github.com",
      owner: "owner",
      repo: "repo",
      repoKey: "owner/repo",
    });
  });

  it("parses owner/repo shorthand", () => {
    expect(parseRepoUrl("owner/repo")).toEqual({
      host: "github.com",
      owner: "owner",
      repo: "repo",
      repoKey: "owner/repo",
    });
  });

  it("returns null for empty string", () => expect(parseRepoUrl("")).toBeNull());

  it("returns null for bare word (no slash)", () =>
    expect(parseRepoUrl("noslash")).toBeNull());

  it("returns null for https URL with no owner segment", () =>
    expect(parseRepoUrl("https://github.com/")).toBeNull());

  it("returns null for https URL when repo normalises to empty string", () =>
    // ".git" stripped by normalizeRepoName → repo = ""
    expect(parseRepoUrl("https://github.com/owner/.git")).toBeNull());

  it("returns null for ssh:// URL when repo normalises to empty string", () =>
    expect(parseRepoUrl("ssh://github.com/owner/.git")).toBeNull());

  it("returns null for malformed git@ (no colon)", () =>
    expect(parseRepoUrl("git@nocolon")).toBeNull());

  it("returns null for git@ when path has only one part", () =>
    // "singlepart" has no "/" → parts.length < 2
    expect(parseRepoUrl("git@github.com:singlepart")).toBeNull());

  it("returns null for git@ when repo normalises to empty string", () =>
    // ".git" stripped by normalizeRepoName → repo = ""
    expect(parseRepoUrl("git@github.com:owner/.git")).toBeNull());

  it("returns null for shorthand when repo part is empty after .git strip", () =>
    // "owner/" → repo = "" after split
    expect(parseRepoUrl("owner/")).toBeNull());

  it("returns null for ssh:// URL with fewer than 2 path parts", () =>
    expect(parseRepoUrl("ssh://github.com/owner")).toBeNull());
});

describe("resolveRepoTarget", () => {
  it("parses REPO_URL when set", () => {
    cfg({ REPO_URL: "https://github.com/owner/repo" });
    expect(resolveRepoTarget()?.repoKey).toBe("owner/repo");
  });

  it("falls back to GITHUB_OWNER + GITHUB_REPO", () => {
    cfg({ GITHUB_OWNER: "myowner", GITHUB_REPO: "myrepo" });
    const target = resolveRepoTarget();
    expect(target?.owner).toBe("myowner");
    expect(target?.repo).toBe("myrepo");
    expect(target?.repoKey).toBe("myowner/myrepo");
  });

  it("returns null when nothing configured", () => {
    cfg();
    expect(resolveRepoTarget()).toBeNull();
  });
});

describe("resolveRepoKey", () => {
  it("returns repoKey from target when available", () => {
    cfg({ REPO_URL: "https://github.com/owner/repo" });
    expect(resolveRepoKey()).toBe("owner/repo");
  });

  it("uses provided repoPath when no target", () => {
    cfg();
    expect(resolveRepoKey("/some/path")).toBe("/some/path");
  });

  it("falls back to RAG_REPO_PATH", () => {
    cfg({ RAG_REPO_PATH: "/rag/path" });
    expect(resolveRepoKey()).toBe("/rag/path");
  });

  it("falls back to AUTO_FIX_REPO_PATH", () => {
    cfg({ AUTO_FIX_REPO_PATH: "/fix/path" });
    expect(resolveRepoKey()).toBe("/fix/path");
  });

  it("returns null when nothing is configured", () => {
    cfg();
    expect(resolveRepoKey()).toBeNull();
  });
});

describe("buildCloneUrl", () => {
  const target = {
    host: "github.com",
    owner: "owner",
    repo: "repo",
    repoKey: "owner/repo",
  };

  it("builds token-authenticated HTTPS URL", () => {
    expect(buildCloneUrl(target, "mytoken")).toBe(
      "https://mytoken@github.com/owner/repo.git"
    );
  });

  it("percent-encodes @ in token", () => {
    expect(buildCloneUrl(target, "tok@en")).toBe(
      "https://tok%40en@github.com/owner/repo.git"
    );
  });

  it("uses provided https repoUrl directly", () => {
    expect(
      buildCloneUrl(target, undefined, "https://github.com/owner/repo")
    ).toBe("https://github.com/owner/repo");
  });

  it("uses provided git@ repoUrl directly", () => {
    expect(
      buildCloneUrl(target, undefined, "git@github.com:owner/repo")
    ).toBe("git@github.com:owner/repo");
  });

  it("uses provided ssh:// repoUrl directly", () => {
    expect(
      buildCloneUrl(target, undefined, "ssh://git@github.com/owner/repo")
    ).toBe("ssh://git@github.com/owner/repo");
  });

  it("falls back to unauthenticated HTTPS when no token or repoUrl", () => {
    expect(buildCloneUrl(target)).toBe(
      "https://github.com/owner/repo.git"
    );
  });
});
