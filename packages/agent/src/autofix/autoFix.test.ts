import { describe, expect, it, vi, afterEach } from "vitest";
import path from "node:path";

vi.mock("../lib/config.js", () => ({ getConfig: vi.fn() }));
vi.mock("../lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../lib/llm.js", () => ({
  assessFixability: vi.fn(),
  generateFixProposal: vi.fn(),
  generateFixRewrite: vi.fn(),
}));
vi.mock("../rag/retrieveRepo.js", () => ({ retrieveRepoContext: vi.fn() }));
vi.mock("../tools/dockerSandbox.js", () => ({ runInSandbox: vi.fn() }));
vi.mock("../lib/github.js", () => ({
  createIssueComment: vi.fn().mockResolvedValue({ created: true }),
  createPullRequest: vi.fn(),
}));
vi.mock("../lib/repoTarget.js", () => ({ resolveRepoTarget: vi.fn() }));
vi.mock("../rag/repoCache.js", () => ({ getCachedRepoPath: vi.fn() }));
vi.mock("../memory/postgres.js", () => ({
  getRecentAutoFixAttempts: vi.fn(),
  recordAutoFixAttempt: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../lib/git.js", () => ({ execGit: vi.fn() }));
vi.mock("node:fs/promises", () => {
  const mod = {
    mkdir: vi.fn(),
    mkdtemp: vi.fn(),
    cp: vi.fn(),
    writeFile: vi.fn(),
    rm: vi.fn(),
    access: vi.fn(),
    readFile: vi.fn(),
  };
  return { ...mod, default: mod };
});

import { autoFixIncident } from "./autoFix.js";
import { getConfig } from "../lib/config.js";
import {
  assessFixability,
  generateFixProposal,
  generateFixRewrite,
} from "../lib/llm.js";
import { retrieveRepoContext } from "../rag/retrieveRepo.js";
import { runInSandbox } from "../tools/dockerSandbox.js";
import { createIssueComment, createPullRequest } from "../lib/github.js";
import { resolveRepoTarget } from "../lib/repoTarget.js";
import { getCachedRepoPath } from "../rag/repoCache.js";
import {
  getRecentAutoFixAttempts,
  recordAutoFixAttempt,
} from "../memory/postgres.js";
import { execGit } from "../lib/git.js";
import * as fs from "node:fs/promises";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const incident = {
  id: "inc-1",
  title: "Error burst on /api",
  severity: "high" as const,
  evidence: ["log line"],
  firstSeen: "100",
  lastSeen: "200",
  count: 3,
};

// Valid unified diff — passes isUnifiedDiff() and sanitizeDiff() unchanged
const VALID_DIFF = [
  "diff --git a/src/index.ts b/src/index.ts",
  "index abc..def 100644",
  "--- a/src/index.ts",
  "+++ b/src/index.ts",
  "@@ -1,2 +1,2 @@",
  "-const x = 1;",
  "+const x = 2;",
  "",
].join("\n");

const validProposal = {
  summary: "Fix the bug",
  reason: "Upstream error",
  test_plan: ["npm test"],
  diff: VALID_DIFF,
};

const validRewrite = {
  summary: "Rewrite fix",
  reason: "Patch failed",
  test_plan: ["npm test"],
  files: [{ path: "src/index.ts", content: "const x = 2;\n" }],
};

const input = { incident, issueNumber: 42 };

// Use an OS-native repo path so path.resolve works consistently on Windows
const TEST_REPO = path.resolve("test-repo");
// Temp dir that path.join / path.resolve will treat as OS-native
const TEST_TEMP = path.resolve("tmp-test", "agentic-fix-abc");

function baseConfig(overrides: Record<string, unknown> = {}) {
  return {
    AUTO_FIX_MODE: "on",
    AUTO_FIX_SEVERITY: "all",
    AUTO_FIX_SKIP_AFTER_FAILURES: 0,
    AUTO_FIX_REPO_PATH: TEST_REPO,
    AUTO_FIX_BRANCH_PREFIX: "agentic-fix",
    AUTO_FIX_TEST_COMMAND: "npm test",
    AUTO_FIX_INSTALL_COMMAND: "",
    AUTO_FIX_SANDBOX_IMAGE: "node:20",
    AUTO_FIX_MIN_SCORE: 0,
    GITHUB_DEFAULT_BRANCH: "main",
    GIT_USER_NAME: "bot",
    GIT_USER_EMAIL: "bot@test.com",
    REPO_URL: undefined,
    GITHUB_OWNER: undefined,
    ...overrides,
  };
}

/**
 * Sets up a full, successful happy-path environment.
 * All fs operations succeed, all git calls succeed, sandbox passes, PR is created.
 * Individual tests override specific mocks AFTER calling this.
 */
function mockHappyPath() {
  vi.mocked(getConfig).mockReturnValue(baseConfig() as any);
  vi.mocked(getRecentAutoFixAttempts).mockResolvedValue([]);
  vi.mocked(retrieveRepoContext).mockResolvedValue([
    { path: "src/index.ts", content: "const x = 1;", score: 0.9 },
  ]);
  vi.mocked(assessFixability).mockResolvedValue({
    fixability_score: 0.9,
    reason: "clear code fix available",
  });
  vi.mocked(generateFixProposal).mockResolvedValue(validProposal);
  vi.mocked(generateFixRewrite).mockResolvedValue(null);

  // Filesystem — must be re-set after every vi.resetAllMocks()
  vi.mocked(fs.mkdir).mockResolvedValue(undefined);
  vi.mocked(fs.mkdtemp).mockResolvedValue(TEST_TEMP);
  vi.mocked(fs.cp).mockResolvedValue(undefined);
  vi.mocked(fs.writeFile).mockResolvedValue(undefined);
  vi.mocked(fs.rm).mockResolvedValue(undefined);
  // /.dockerenv → ENOENT (not in Docker); package.json → ENOENT (no install needed)
  vi.mocked(fs.access).mockRejectedValue(new Error("ENOENT"));
  // PR template → ENOENT (no template)
  vi.mocked(fs.readFile).mockRejectedValue(new Error("ENOENT"));

  vi.mocked(runInSandbox).mockResolvedValue({ exitCode: 0, output: "ok" });
  // All git operations succeed by default
  vi.mocked(execGit).mockResolvedValue({ code: 0, output: "" });

  vi.mocked(createPullRequest).mockResolvedValue({
    created: true,
    url: "https://github.com/o/r/pull/1",
  });
  vi.mocked(createIssueComment).mockResolvedValue({ created: true });
  vi.mocked(recordAutoFixAttempt).mockResolvedValue(undefined);
}

// resetAllMocks wipes the Once queue AND implementations — gives clean state per test
afterEach(() => vi.resetAllMocks());

// ─── Early exit paths ─────────────────────────────────────────────────────────

describe("autoFixIncident — early exits", () => {
  it("returns skipped when AUTO_FIX_MODE is off", async () => {
    vi.mocked(getConfig).mockReturnValue(
      baseConfig({ AUTO_FIX_MODE: "off" }) as any
    );
    const result = await autoFixIncident(input);
    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("auto_fix_disabled_or_severity");
  });

  it("returns skipped when severity is below AUTO_FIX_SEVERITY threshold", async () => {
    vi.mocked(getConfig).mockReturnValue(
      baseConfig({ AUTO_FIX_SEVERITY: "critical" }) as any
    );
    const result = await autoFixIncident({
      ...input,
      incident: { ...incident, severity: "low" },
    });
    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("auto_fix_disabled_or_severity");
  });

  it("returns skipped on repeated_failures without recording a new DB attempt", async () => {
    vi.mocked(getConfig).mockReturnValue(
      baseConfig({ AUTO_FIX_SKIP_AFTER_FAILURES: 1 }) as any
    );
    vi.mocked(getRecentAutoFixAttempts).mockResolvedValue([
      { outcome: "failed", reason: "sandbox", created_at: new Date() },
    ]);
    const result = await autoFixIncident(input);
    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("repeated_failures");
    expect(recordAutoFixAttempt).not.toHaveBeenCalled();
  });

  it("warns and continues past the DB check when getRecentAutoFixAttempts throws", async () => {
    vi.mocked(getConfig).mockReturnValue(
      baseConfig({ AUTO_FIX_SKIP_AFTER_FAILURES: 1 }) as any
    );
    vi.mocked(getRecentAutoFixAttempts).mockRejectedValue(new Error("db error"));
    vi.mocked(retrieveRepoContext).mockResolvedValue([]);
    vi.mocked(assessFixability).mockResolvedValue(null);
    vi.mocked(generateFixProposal).mockResolvedValue(null);
    vi.mocked(generateFixRewrite).mockResolvedValue(null);
    vi.mocked(fs.access).mockRejectedValue(new Error("ENOENT"));
    // Should proceed past the DB error and fail at invalid_diff
    const result = await autoFixIncident(input);
    expect(result.status).not.toBe("skipped");
  });

  it("returns failed:AUTO_FIX_REPO_PATH when cached repo path resolves to empty string", async () => {
    vi.mocked(getConfig).mockReturnValue(
      baseConfig({ AUTO_FIX_REPO_PATH: "" }) as any
    );
    vi.mocked(getRecentAutoFixAttempts).mockResolvedValue([]);
    // getCachedRepoPath resolves to "" → !repoPath check triggers
    vi.mocked(getCachedRepoPath).mockResolvedValue("" as any);
    const result = await autoFixIncident(input);
    expect(result.status).toBe("failed");
    expect(result.reason).toBe("AUTO_FIX_REPO_PATH not configured");
    expect(recordAutoFixAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "failed" })
    );
  });

  it("falls back to cached repo path when AUTO_FIX_REPO_PATH is empty", async () => {
    vi.mocked(getConfig).mockReturnValue(
      baseConfig({ AUTO_FIX_REPO_PATH: "" }) as any
    );
    vi.mocked(getRecentAutoFixAttempts).mockResolvedValue([]);
    vi.mocked(getCachedRepoPath).mockResolvedValue(TEST_REPO);
    vi.mocked(retrieveRepoContext).mockResolvedValue([]);
    vi.mocked(assessFixability).mockResolvedValue(null);
    vi.mocked(generateFixProposal).mockResolvedValue(null);
    vi.mocked(generateFixRewrite).mockResolvedValue(null);
    vi.mocked(fs.access).mockRejectedValue(new Error("ENOENT"));
    const result = await autoFixIncident(input);
    expect(result.reason).toBe("invalid_diff");
  });

  it("returns skipped when fixability score is below the configured minimum", async () => {
    vi.mocked(getConfig).mockReturnValue(
      baseConfig({ AUTO_FIX_MIN_SCORE: 0.8 }) as any
    );
    vi.mocked(getRecentAutoFixAttempts).mockResolvedValue([]);
    vi.mocked(retrieveRepoContext).mockResolvedValue([]);
    vi.mocked(assessFixability).mockResolvedValue({
      fixability_score: 0.3,
      reason: "too risky",
    });
    const result = await autoFixIncident(input);
    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("fixability_below_threshold");
    expect(recordAutoFixAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "skipped", reason: "fixability_below_threshold" })
    );
  });

  it("uses heuristic-only score when LLM assessment returns null", async () => {
    vi.mocked(getConfig).mockReturnValue(
      baseConfig({ AUTO_FIX_MIN_SCORE: 0.99 }) as any
    );
    vi.mocked(getRecentAutoFixAttempts).mockResolvedValue([]);
    vi.mocked(retrieveRepoContext).mockResolvedValue([]);
    vi.mocked(assessFixability).mockResolvedValue(null);
    const result = await autoFixIncident(input);
    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("fixability_below_threshold");
  });
});

// ─── Diff validation ──────────────────────────────────────────────────────────

describe("autoFixIncident — diff validation", () => {
  it("returns failed when diff exceeds MAX_DIFF_BYTES", async () => {
    mockHappyPath();
    vi.mocked(generateFixProposal).mockResolvedValue({
      ...validProposal,
      diff: VALID_DIFF + "+".repeat(210_000),
    });
    const result = await autoFixIncident(input);
    expect(result.status).toBe("failed");
    expect(result.reason).toBe("diff_too_large");
    expect(recordAutoFixAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "failed", reason: "diff_too_large" })
    );
  });

  it("returns failed when both diff is invalid and rewrite is null", async () => {
    mockHappyPath();
    vi.mocked(generateFixProposal).mockResolvedValue({
      ...validProposal,
      diff: "not a valid unified diff",
    });
    vi.mocked(generateFixRewrite).mockResolvedValue(null);
    const result = await autoFixIncident(input);
    expect(result.status).toBe("failed");
    expect(result.reason).toBe("invalid_diff");
  });

  it("truncates long invalid diff in commentInvalidDiff (covers line 115)", async () => {
    mockHappyPath();
    // Diff > 800 chars but not a valid unified diff → commentInvalidDiff → truncate branch
    vi.mocked(generateFixProposal).mockResolvedValue({
      ...validProposal,
      diff: "invalid-diff-header " + "x".repeat(900),
    });
    vi.mocked(generateFixRewrite).mockResolvedValue(null);
    const result = await autoFixIncident(input);
    expect(result.status).toBe("failed");
    expect(result.reason).toBe("invalid_diff");
  });

  it("falls back to rewrite when diff is invalid and produces pr_created", async () => {
    mockHappyPath();
    vi.mocked(generateFixProposal).mockResolvedValue({
      ...validProposal,
      diff: "not a valid unified diff",
    });
    vi.mocked(generateFixRewrite).mockResolvedValue(validRewrite);
    const result = await autoFixIncident(input);
    expect(result.status).toBe("pr_created");
  });

  it("returns failed when proposal is null and rewrite is also null", async () => {
    mockHappyPath();
    vi.mocked(generateFixProposal).mockResolvedValue(null);
    vi.mocked(generateFixRewrite).mockResolvedValue(null);
    const result = await autoFixIncident(input);
    expect(result.status).toBe("failed");
    expect(result.reason).toBe("invalid_diff");
  });

  it("strips markdown fences from diff before validation", async () => {
    mockHappyPath();
    vi.mocked(generateFixProposal).mockResolvedValue({
      ...validProposal,
      diff: "```diff\n" + VALID_DIFF + "```",
    });
    const result = await autoFixIncident(input);
    expect(result.status).toBe("pr_created");
  });
});

// ─── Safety checks ────────────────────────────────────────────────────────────

describe("autoFixIncident — safety checks", () => {
  it("extracts touched files via fallback regex when diff has no diff --git header (covers line 249)", async () => {
    mockHappyPath();
    // A unified diff without "diff --git" — extractDiffFiles falls back to "--- a/" regex
    const plainUnifiedDiff = [
      "--- a/.env",
      "+++ b/.env",
      "@@ -1 +1 @@",
      "-OLD=1",
      "+NEW=2",
      "",
    ].join("\n");
    vi.mocked(generateFixProposal).mockResolvedValue({
      ...validProposal,
      diff: plainUnifiedDiff,
    });
    const result = await autoFixIncident(input);
    // .env is in the denylist → blocked via the fallback-extracted file list
    expect(result.status).toBe("failed");
    expect(result.reason).toBe("unsafe_files");
  });

  it("blocks when a touched file is in the denylist", async () => {
    mockHappyPath();
    const envDiff = VALID_DIFF.replace(
      "a/src/index.ts b/src/index.ts",
      "a/.env b/.env"
    );
    vi.mocked(generateFixProposal).mockResolvedValue({
      ...validProposal,
      diff: envDiff,
    });
    const result = await autoFixIncident(input);
    expect(result.status).toBe("failed");
    expect(result.reason).toBe("unsafe_files");
  });

  it("blocks when a rewrite file is in the denylist", async () => {
    mockHappyPath();
    vi.mocked(generateFixProposal).mockResolvedValue(null);
    vi.mocked(generateFixRewrite).mockResolvedValue({
      ...validRewrite,
      files: [{ path: ".env.local", content: "SECRET=x" }],
    });
    const result = await autoFixIncident(input);
    expect(result.status).toBe("failed");
    expect(result.reason).toBe("unsafe_files");
  });
});

// ─── Rewrite validation ───────────────────────────────────────────────────────

describe("autoFixIncident — rewrite validation", () => {
  it("returns rewrite_invalid when rewrite content is less than 50% of original", async () => {
    mockHappyPath();
    vi.mocked(generateFixProposal).mockResolvedValue(null);
    // 25-line original — readFile must return a string, not a Buffer
    const longContent = Array.from({ length: 25 }, (_, i) => `line ${i}`).join("\n");
    vi.mocked(fs.readFile).mockResolvedValueOnce(longContent as any);
    vi.mocked(generateFixRewrite).mockResolvedValue({
      ...validRewrite,
      files: [{ path: "src/index.ts", content: "x" }],
    });
    const result = await autoFixIncident(input);
    expect(result.status).toBe("failed");
    expect(result.reason).toBe("rewrite_invalid");
  });

  it("returns rewrite_invalid via rewrite_too_short when original < 20 lines (covers line 227)", async () => {
    mockHappyPath();
    vi.mocked(generateFixProposal).mockResolvedValue(null);
    // 10-line original → originalLines.length < 20 → anchor check skipped, size check runs
    const shortOriginal = Array.from(
      { length: 10 },
      (_, i) => `function line${i}() { return ${i}; }`
    ).join("\n");
    vi.mocked(fs.readFile).mockResolvedValueOnce(shortOriginal as any);
    vi.mocked(generateFixRewrite).mockResolvedValue({
      ...validRewrite,
      files: [{ path: "src/index.ts", content: "x" }], // way shorter than 50% of original
    });
    const result = await autoFixIncident(input);
    expect(result.status).toBe("failed");
    expect(result.reason).toBe("rewrite_invalid");
  });

  it("returns failed:invalid_diff when rewrite file exceeds MAX_FILE_BYTES (covers line 186)", async () => {
    mockHappyPath();
    vi.mocked(generateFixProposal).mockResolvedValue(null);
    // First call: rewrite with file content > 500KB → applyRewriteFiles throws at line 186
    // Second call (fallback in catch block): null → returns invalid_diff
    vi.mocked(generateFixRewrite)
      .mockResolvedValueOnce({
        ...validRewrite,
        files: [{ path: "src/index.ts", content: "x".repeat(500_001) }],
      })
      .mockResolvedValueOnce(null);
    const result = await autoFixIncident(input);
    expect(result.status).toBe("failed");
    expect(result.reason).toBe("invalid_diff");
  });

  it("returns failed:invalid_diff when rewrite file path traverses outside workDir (covers line 161)", async () => {
    mockHappyPath();
    vi.mocked(generateFixProposal).mockResolvedValue(null);
    // Path traversal → resolveSafePath throws → caught by patch try-catch → fallback returns null
    vi.mocked(generateFixRewrite)
      .mockResolvedValueOnce({
        ...validRewrite,
        files: [{ path: "../../etc/passwd", content: "x" }],
      })
      .mockResolvedValueOnce(null);
    const result = await autoFixIncident(input);
    expect(result.status).toBe("failed");
    expect(result.reason).toBe("invalid_diff");
  });

  it("throws unsafe-file error in applyRewriteFiles fallback path (covers line 183)", async () => {
    mockHappyPath();
    // Diff apply fails in workDir → fallback generateFixRewrite returns a file with a denylist path.
    // validateRewriteFiles has no denylist check, so it passes; applyRewriteFiles hits line 182.
    vi.mocked(execGit)
      .mockResolvedValueOnce({ code: 1, output: "apply fail" }) // workDir apply attempt 1
      .mockResolvedValueOnce({ code: 1, output: "sanitize retry fail" }); // workDir apply retry
    vi.mocked(generateFixRewrite).mockResolvedValue({
      ...validRewrite,
      files: [{ path: ".env", content: "SECRET=x" }],
    });
    const result = await autoFixIncident(input);
    // Exception from line 183 propagates out of the catch block → unexpected_error
    expect(result.status).toBe("failed");
    expect(result.reason).toBe("unexpected_error");
  });
});

// ─── Sandbox ──────────────────────────────────────────────────────────────────

describe("autoFixIncident — sandbox", () => {
  it("runs sandbox install when package.json exists and install command is set", async () => {
    mockHappyPath();
    vi.mocked(getConfig).mockReturnValue(
      baseConfig({ AUTO_FIX_INSTALL_COMMAND: "npm install" }) as any
    );
    // /.dockerenv → ENOENT (not in Docker); package.json → exists
    vi.mocked(fs.access)
      .mockRejectedValueOnce(new Error("ENOENT"))
      .mockResolvedValueOnce(undefined);
    vi.mocked(runInSandbox).mockResolvedValue({ exitCode: 0, output: "ok" });
    const result = await autoFixIncident(input);
    expect(result.status).toBe("pr_created");
    expect(runInSandbox).toHaveBeenCalledTimes(2); // install + test
  });

  it("returns sandbox_install_failed when install exits non-zero", async () => {
    mockHappyPath();
    vi.mocked(getConfig).mockReturnValue(
      baseConfig({ AUTO_FIX_INSTALL_COMMAND: "npm install" }) as any
    );
    vi.mocked(fs.access)
      .mockRejectedValueOnce(new Error("ENOENT"))
      .mockResolvedValueOnce(undefined);
    vi.mocked(runInSandbox).mockResolvedValueOnce({
      exitCode: 1,
      output: "ERESOLVE",
    });
    const result = await autoFixIncident(input);
    expect(result.status).toBe("failed");
    expect(result.reason).toBe("sandbox_install_failed");
  });

  it("returns sandbox_validation_failed when tests exit non-zero", async () => {
    mockHappyPath();
    vi.mocked(runInSandbox).mockResolvedValue({ exitCode: 1, output: "FAIL" });
    const result = await autoFixIncident(input);
    expect(result.status).toBe("failed");
    expect(result.reason).toBe("sandbox_validation_failed");
  });
});

// ─── Git operations ───────────────────────────────────────────────────────────

describe("autoFixIncident — git operations", () => {
  it("returns dirty_repo when status --porcelain shows changes", async () => {
    mockHappyPath();
    // apply(workDir) → success; status → dirty
    vi.mocked(execGit)
      .mockResolvedValueOnce({ code: 0, output: "" }) // apply in workDir
      .mockResolvedValueOnce({ code: 0, output: "M src/index.ts\n" }); // status dirty
    const result = await autoFixIncident(input);
    expect(result.status).toBe("failed");
    expect(result.reason).toBe("dirty_repo");
  });

  it("returns git_checkout_base_failed when checkout main fails", async () => {
    mockHappyPath();
    vi.mocked(execGit)
      .mockResolvedValueOnce({ code: 0, output: "" }) // apply workDir
      .mockResolvedValueOnce({ code: 0, output: "" }) // status clean
      .mockResolvedValueOnce({ code: 1, output: "branch not found" }); // checkout main
    const result = await autoFixIncident(input);
    expect(result.status).toBe("failed");
    expect(result.reason).toBe("git_checkout_base_failed");
  });

  it("returns git_checkout_failed when checkout -b fails", async () => {
    mockHappyPath();
    vi.mocked(execGit)
      .mockResolvedValueOnce({ code: 0, output: "" }) // apply workDir
      .mockResolvedValueOnce({ code: 0, output: "" }) // status
      .mockResolvedValueOnce({ code: 0, output: "" }) // checkout main
      .mockResolvedValueOnce({ code: 0, output: "" }) // apply repoPath
      .mockResolvedValueOnce({ code: 1, output: "branch exists" }); // checkout -b
    const result = await autoFixIncident(input);
    expect(result.status).toBe("failed");
    expect(result.reason).toBe("git_checkout_failed");
  });

  it("returns git_commit_failed when commit fails", async () => {
    mockHappyPath();
    vi.mocked(execGit)
      .mockResolvedValueOnce({ code: 0, output: "" }) // apply workDir
      .mockResolvedValueOnce({ code: 0, output: "" }) // status
      .mockResolvedValueOnce({ code: 0, output: "" }) // checkout main
      .mockResolvedValueOnce({ code: 0, output: "" }) // apply repoPath
      .mockResolvedValueOnce({ code: 0, output: "" }) // checkout -b
      .mockResolvedValueOnce({ code: 0, output: "" }) // config name
      .mockResolvedValueOnce({ code: 0, output: "" }) // config email
      .mockResolvedValueOnce({ code: 0, output: "" }) // add -A
      .mockResolvedValueOnce({ code: 1, output: "nothing to commit" }); // commit
    const result = await autoFixIncident(input);
    expect(result.status).toBe("failed");
    expect(result.reason).toBe("git_commit_failed");
  });

  it("returns git_push_failed when push fails", async () => {
    mockHappyPath();
    vi.mocked(execGit)
      .mockResolvedValueOnce({ code: 0, output: "" }) // apply workDir
      .mockResolvedValueOnce({ code: 0, output: "" }) // status
      .mockResolvedValueOnce({ code: 0, output: "" }) // checkout main
      .mockResolvedValueOnce({ code: 0, output: "" }) // apply repoPath
      .mockResolvedValueOnce({ code: 0, output: "" }) // checkout -b
      .mockResolvedValueOnce({ code: 0, output: "" }) // config name
      .mockResolvedValueOnce({ code: 0, output: "" }) // config email
      .mockResolvedValueOnce({ code: 0, output: "" }) // add -A
      .mockResolvedValueOnce({ code: 0, output: "" }) // commit
      .mockResolvedValueOnce({ code: 1, output: "rejected" }); // push
    const result = await autoFixIncident(input);
    expect(result.status).toBe("failed");
    expect(result.reason).toBe("git_push_failed");
  });

  it("succeeds when first apply fails but sanitize-retry succeeds (covers line 293)", async () => {
    mockHappyPath();
    // Use a diff with context lines (starts with space), a no-newline marker (starts with \),
    // and an internal empty line — these exercise sanitizeDiff branches at lines 146, 147, 151-152.
    const comprehensiveDiff = [
      "diff --git a/src/index.ts b/src/index.ts",
      "index abc..def 100644",
      "--- a/src/index.ts",
      "+++ b/src/index.ts",
      "@@ -1,3 +1,3 @@",
      " context line",          // space prefix → covers line 146
      "-const x = 1;",
      "+const x = 2;",
      "\\ No newline at end of file", // backslash prefix → covers line 147
      "",                        // empty line → covers lines 151-152
      "@@ -10,1 +10,1 @@",
      "-y",
      "+z",
    ].join("\n");
    vi.mocked(generateFixProposal).mockResolvedValue({
      ...validProposal,
      diff: comprehensiveDiff,
    });
    // First apply in workDir fails; sanitized retry succeeds → covers the retry-success branch.
    vi.mocked(execGit)
      .mockResolvedValueOnce({ code: 1, output: "whitespace error" }) // workDir apply attempt 1 → fail
      .mockResolvedValueOnce({ code: 0, output: "" }) // workDir apply retry → success (line 293)
      .mockResolvedValueOnce({ code: 0, output: "" }) // status --porcelain
      .mockResolvedValueOnce({ code: 0, output: "" }) // checkout main
      .mockResolvedValueOnce({ code: 0, output: "" }) // repoPath apply
      .mockResolvedValueOnce({ code: 0, output: "" }) // checkout -b
      .mockResolvedValueOnce({ code: 0, output: "" }) // config name
      .mockResolvedValueOnce({ code: 0, output: "" }) // config email
      .mockResolvedValueOnce({ code: 0, output: "" }) // add -A
      .mockResolvedValueOnce({ code: 0, output: "" }) // commit
      .mockResolvedValueOnce({ code: 0, output: "" }); // push
    const result = await autoFixIncident(input);
    expect(result.status).toBe("pr_created");
  });

  it("returns invalid_diff when apply fails and there is no rewrite fallback", async () => {
    mockHappyPath();
    // normalizeDiff trims the trailing newline; sanitizeDiff adds it back → sanitized !== diff
    // → applyPatch retries once with the sanitized version.  Both calls must fail.
    vi.mocked(execGit)
      .mockResolvedValueOnce({ code: 1, output: "patch does not apply" }) // initial apply
      .mockResolvedValueOnce({ code: 1, output: "sanitized retry also fails" }); // sanitize retry
    vi.mocked(generateFixRewrite).mockResolvedValue(null);
    const result = await autoFixIncident(input);
    expect(result.status).toBe("failed");
    expect(result.reason).toBe("invalid_diff");
  });

  it("falls back to rewrite strategy when patch apply fails in workDir", async () => {
    mockHappyPath();
    // Both the initial apply and the sanitize-retry must fail to trigger the rewrite fallback
    vi.mocked(execGit)
      .mockResolvedValueOnce({ code: 1, output: "patch does not apply" })
      .mockResolvedValueOnce({ code: 1, output: "sanitized retry also fails" });
    vi.mocked(generateFixRewrite).mockResolvedValue(validRewrite);
    const result = await autoFixIncident(input);
    expect(result.status).toBe("pr_created");
  });

  it("uses repoTarget.owner when resolveRepoTarget returns an owner (covers line 169 ?? left side)", async () => {
    mockHappyPath();
    // GIT_USER_NAME/EMAIL undefined → falls back to owner derived from repoTarget.owner
    vi.mocked(getConfig).mockReturnValue(
      baseConfig({ GIT_USER_NAME: undefined, GIT_USER_EMAIL: undefined }) as any
    );
    vi.mocked(resolveRepoTarget).mockReturnValue({
      owner: "testowner",
      repo: "testrepo",
      host: "github.com",
    } as any);
    const result = await autoFixIncident(input);
    expect(result.status).toBe("pr_created");
    // identity: name="testowner", email="testowner@users.noreply.github.com"
    expect(execGit).toHaveBeenCalledWith(
      ["config", "user.name", "testowner"],
      expect.any(String)
    );
  });

  it("uses GITHUB_OWNER as identity fallback when repoTarget has no owner (covers line 169 second ?? left side)", async () => {
    mockHappyPath();
    vi.mocked(getConfig).mockReturnValue(
      baseConfig({ GITHUB_OWNER: "myorg", GIT_USER_NAME: undefined, GIT_USER_EMAIL: undefined }) as any
    );
    // resolveRepoTarget returns undefined (vi.fn() default) → falls through to GITHUB_OWNER
    const result = await autoFixIncident(input);
    expect(result.status).toBe("pr_created");
    expect(execGit).toHaveBeenCalledWith(
      ["config", "user.name", "myorg"],
      expect.any(String)
    );
  });
});

// ─── PR creation ──────────────────────────────────────────────────────────────

describe("autoFixIncident — PR creation", () => {
  it("returns pr_create_failed when PR creation returns created:false", async () => {
    mockHappyPath();
    vi.mocked(createPullRequest).mockResolvedValue({
      created: false,
      reason: "GitHub API 422",
    });
    const result = await autoFixIncident(input);
    expect(result.status).toBe("failed");
    expect(result.reason).toBe("pr_create_failed");
    expect(recordAutoFixAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "failed", reason: "pr_create_failed" })
    );
  });

  it("uses 'unknown' fallback when createPullRequest returns no reason (covers lines 965-969)", async () => {
    mockHappyPath();
    // pr.reason is undefined → the ?? "unknown" / ?? "unknown error" branches are taken
    vi.mocked(createPullRequest).mockResolvedValue({ created: false });
    const result = await autoFixIncident(input);
    expect(result.status).toBe("failed");
    expect(result.reason).toBe("pr_create_failed");
    expect(createIssueComment).toHaveBeenCalledWith(
      input.issueNumber,
      expect.stringContaining("unknown error")
    );
  });

  it("uses input.summary fields in repo context query when summary is provided (covers lines 418,438)", async () => {
    mockHappyPath();
    const result = await autoFixIncident({
      ...input,
      summary: { summary: "detailed summary text", confidence: 0.95 },
    });
    expect(result.status).toBe("pr_created");
    // summary.summary is included in the RAG query
    expect(retrieveRepoContext).toHaveBeenCalledWith(
      expect.stringContaining("detailed summary text")
    );
  });

  it("returns pr_created with prUrl on the full happy path", async () => {
    mockHappyPath();
    const result = await autoFixIncident(input);
    expect(result.status).toBe("pr_created");
    expect(result.prUrl).toBe("https://github.com/o/r/pull/1");
    expect(recordAutoFixAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "pr_created" })
    );
  });

  it("uses PR template body when .github/pull_request_template.md exists", async () => {
    mockHappyPath();
    const template = "# Summary\n\n## What changed\n\n## Why\n\n## Test plan\n";
    // readFile is called LAST (after git ops) for the PR template — must be a string
    vi.mocked(fs.readFile).mockResolvedValueOnce(template as any);
    const result = await autoFixIncident(input);
    expect(result.status).toBe("pr_created");
  });

  it("succeeds with the rewrite strategy and records pr_created", async () => {
    mockHappyPath();
    vi.mocked(generateFixProposal).mockResolvedValue(null);
    vi.mocked(generateFixRewrite).mockResolvedValue(validRewrite);
    const result = await autoFixIncident(input);
    expect(result.status).toBe("pr_created");
    expect(recordAutoFixAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "pr_created" })
    );
  });
});

// ─── Additional coverage: severity threshold + inDocker paths ────────────────

describe("autoFixIncident — isSeverityEnabled non-all threshold", () => {
  it("allows auto-fix when severity exactly meets a non-all threshold (covers line 61)", async () => {
    mockHappyPath();
    // AUTO_FIX_SEVERITY = "high" (not "all") → severityRank("high") >= severityRank("high") → true
    vi.mocked(getConfig).mockReturnValue(
      baseConfig({ AUTO_FIX_SEVERITY: "high" }) as any
    );
    const result = await autoFixIncident(input); // incident.severity = "high"
    expect(result.status).toBe("pr_created");
  });
});

describe("autoFixIncident — inDocker mode (undefined mounts)", () => {
  it("passes undefined mounts when running inside Docker (covers lines 696, 741)", async () => {
    mockHappyPath();
    vi.mocked(getConfig).mockReturnValue(
      baseConfig({ AUTO_FIX_INSTALL_COMMAND: "npm install" }) as any
    );
    // /.dockerenv exists → inDocker = true; package.json exists → run install
    vi.mocked(fs.access)
      .mockResolvedValueOnce(undefined) // /.dockerenv → inDocker = true
      .mockResolvedValueOnce(undefined); // package.json → hasPackageJson = true
    vi.mocked(runInSandbox)
      .mockResolvedValueOnce({ exitCode: 0, output: "install ok" }) // install
      .mockResolvedValueOnce({ exitCode: 0, output: "tests pass" }); // test
    const result = await autoFixIncident(input);
    expect(result.status).toBe("pr_created");
    const calls = vi.mocked(runInSandbox).mock.calls;
    expect(calls[0][0].mounts).toBeUndefined(); // install (line 696)
    expect(calls[1][0].mounts).toBeUndefined(); // test (line 741)
  });

  it("swallows DB error when recording sandbox_install_failed (covers line 726)", async () => {
    mockHappyPath();
    vi.mocked(getConfig).mockReturnValue(
      baseConfig({ AUTO_FIX_INSTALL_COMMAND: "npm install" }) as any
    );
    vi.mocked(fs.access)
      .mockRejectedValueOnce(new Error("ENOENT")) // /.dockerenv: not in Docker
      .mockResolvedValueOnce(undefined); // package.json exists
    vi.mocked(runInSandbox).mockResolvedValue({ exitCode: 1, output: "fail" });
    vi.mocked(recordAutoFixAttempt).mockRejectedValue(new Error("db gone"));
    const result = await autoFixIncident(input);
    expect(result.status).toBe("failed");
    expect(result.reason).toBe("sandbox_install_failed");
  });
});

// ─── recordAutoFixAttempt error-swallowing (empty catch blocks) ──────────────
//
// Each of the four inner try/catch blocks must be entered at least once so
// the closing } is counted as covered by v8.

describe("autoFixIncident — recordAutoFixAttempt error swallowing", () => {
  // Sequence for git_commit_failed (commit is call #9)
  function gitCommitFailSequence() {
    vi.mocked(execGit)
      .mockResolvedValueOnce({ code: 0, output: "" }) // 1: apply workDir
      .mockResolvedValueOnce({ code: 0, output: "" }) // 2: status
      .mockResolvedValueOnce({ code: 0, output: "" }) // 3: checkout main
      .mockResolvedValueOnce({ code: 0, output: "" }) // 4: apply repoPath
      .mockResolvedValueOnce({ code: 0, output: "" }) // 5: checkout -b
      .mockResolvedValueOnce({ code: 0, output: "" }) // 6: config name
      .mockResolvedValueOnce({ code: 0, output: "" }) // 7: config email
      .mockResolvedValueOnce({ code: 0, output: "" }) // 8: add -A
      .mockResolvedValueOnce({ code: 1, output: "nothing to commit" }); // 9: commit
  }

  // Sequence for git_push_failed (push is call #10)
  function gitPushFailSequence() {
    vi.mocked(execGit)
      .mockResolvedValueOnce({ code: 0, output: "" }) // 1-9 all succeed
      .mockResolvedValueOnce({ code: 0, output: "" })
      .mockResolvedValueOnce({ code: 0, output: "" })
      .mockResolvedValueOnce({ code: 0, output: "" })
      .mockResolvedValueOnce({ code: 0, output: "" })
      .mockResolvedValueOnce({ code: 0, output: "" })
      .mockResolvedValueOnce({ code: 0, output: "" })
      .mockResolvedValueOnce({ code: 0, output: "" })
      .mockResolvedValueOnce({ code: 0, output: "" }) // 9: commit OK
      .mockResolvedValueOnce({ code: 1, output: "rejected" }); // 10: push
  }

  it("swallows DB error when recording git_commit_failed (covers line 897)", async () => {
    mockHappyPath();
    gitCommitFailSequence();
    vi.mocked(recordAutoFixAttempt).mockRejectedValue(new Error("db gone"));
    const result = await autoFixIncident(input);
    expect(result.status).toBe("failed");
    expect(result.reason).toBe("git_commit_failed");
  });

  it("swallows DB error when recording git_push_failed (covers line 920)", async () => {
    mockHappyPath();
    gitPushFailSequence();
    vi.mocked(recordAutoFixAttempt).mockRejectedValue(new Error("db gone"));
    const result = await autoFixIncident(input);
    expect(result.status).toBe("failed");
    expect(result.reason).toBe("git_push_failed");
  });

  it("swallows DB error when recording pr_create_failed (covers line 979)", async () => {
    mockHappyPath();
    vi.mocked(createPullRequest).mockResolvedValue({
      created: false,
      reason: "API 422",
    });
    vi.mocked(recordAutoFixAttempt).mockRejectedValue(new Error("db gone"));
    const result = await autoFixIncident(input);
    expect(result.status).toBe("failed");
    expect(result.reason).toBe("pr_create_failed");
  });

  it("swallows DB error when recording fixability_below_threshold (covers line 456)", async () => {
    mockHappyPath();
    // Very high threshold + null LLM assessment → heuristic score (~0.7) < 0.99 → skipped
    vi.mocked(getConfig).mockReturnValue(
      baseConfig({ AUTO_FIX_MIN_SCORE: 0.99 }) as any
    );
    vi.mocked(assessFixability).mockResolvedValue(null);
    vi.mocked(recordAutoFixAttempt).mockRejectedValue(new Error("db gone"));
    const result = await autoFixIncident(input);
    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("fixability_below_threshold");
  });

  it("swallows DB error when recording diff_too_large (covers line 525)", async () => {
    mockHappyPath();
    vi.mocked(generateFixProposal).mockResolvedValue({
      summary: "fix",
      reason: "fix",
      test_plan: ["test"],
      diff: "diff --git a/src/index.ts b/src/index.ts\n--- a/src/index.ts\n+++ b/src/index.ts\n@@ -1 +1 @@\n-x\n+" + "y".repeat(200_001),
    });
    vi.mocked(recordAutoFixAttempt).mockRejectedValue(new Error("db gone"));
    const result = await autoFixIncident(input);
    expect(result.status).toBe("failed");
    expect(result.reason).toBe("diff_too_large");
  });

  it("swallows DB error recording invalid_diff when proposal is null and no rewrite (covers line 550)", async () => {
    mockHappyPath();
    vi.mocked(generateFixProposal).mockResolvedValue(null);
    vi.mocked(generateFixRewrite).mockResolvedValue(null);
    vi.mocked(recordAutoFixAttempt).mockRejectedValue(new Error("db gone"));
    const result = await autoFixIncident(input);
    expect(result.status).toBe("failed");
    expect(result.reason).toBe("invalid_diff");
  });

  it("swallows DB error recording rewrite_invalid when proposal is null (covers line 569)", async () => {
    mockHappyPath();
    vi.mocked(generateFixProposal).mockResolvedValue(null);
    vi.mocked(generateFixRewrite).mockResolvedValue({
      summary: "fix",
      reason: "fix",
      test_plan: ["test"],
      files: [{ path: "src/index.ts", content: "const x = 2;" }],
    });
    const longOriginal = Array(25)
      .fill("  function originalFoo() { return complexValue(); }")
      .join("\n");
    vi.mocked(fs.readFile)
      .mockResolvedValueOnce(longOriginal as any)
      .mockRejectedValue(new Error("ENOENT"));
    vi.mocked(recordAutoFixAttempt).mockRejectedValue(new Error("db gone"));
    const result = await autoFixIncident(input);
    expect(result.status).toBe("failed");
    expect(result.reason).toBe("rewrite_invalid");
  });

  it("swallows DB error when recording unsafe_files (covers line 600)", async () => {
    mockHappyPath();
    // Put a denylisted file in the diff so the unsafe_files path is hit
    vi.mocked(generateFixProposal).mockResolvedValue({
      summary: "fix",
      reason: "fix",
      test_plan: ["test"],
      diff: "diff --git a/.env b/.env\n--- a/.env\n+++ b/.env\n@@ -1 +1 @@\n-old\n+new",
    });
    vi.mocked(recordAutoFixAttempt).mockRejectedValue(new Error("db gone"));
    const result = await autoFixIncident(input);
    expect(result.status).toBe("failed");
    expect(result.reason).toBe("unsafe_files");
  });

  it("swallows DB error when recording invalid_diff (covers line 640)", async () => {
    mockHappyPath();
    // Both patch apply attempts fail → triggers rewrite fallback
    vi.mocked(execGit)
      .mockResolvedValueOnce({ code: 1, output: "patch fails" })
      .mockResolvedValueOnce({ code: 1, output: "retry fails" });
    vi.mocked(generateFixRewrite).mockResolvedValue(null); // no fallback
    vi.mocked(recordAutoFixAttempt).mockRejectedValue(new Error("db gone"));
    const result = await autoFixIncident(input);
    expect(result.status).toBe("failed");
    expect(result.reason).toBe("invalid_diff");
  });

  it("returns rewrite_invalid when rewrite fails anchor/size validation (covers lines 645-661)", async () => {
    mockHappyPath();
    // Both apply attempts fail → triggers rewrite fallback
    vi.mocked(execGit)
      .mockResolvedValueOnce({ code: 1, output: "patch fails" })
      .mockResolvedValueOnce({ code: 1, output: "retry fails" });
    vi.mocked(generateFixRewrite).mockResolvedValue({
      summary: "fix",
      reason: "fix",
      test_plan: ["test"],
      files: [{ path: "src/index.ts", content: "const x = 2;" }],
    });
    // Original file has 25 non-empty lines; rewrite content "const x = 2;" shares no anchors
    const longOriginal = Array(25)
      .fill("  function originalFoo() { return complexValue(); }")
      .join("\n");
    vi.mocked(fs.readFile)
      .mockResolvedValueOnce(longOriginal as any) // validateRewriteFiles reads original
      .mockRejectedValue(new Error("ENOENT")); // PR template and subsequent reads
    const result = await autoFixIncident(input);
    expect(result.status).toBe("failed");
    expect(result.reason).toBe("rewrite_invalid");
  });

  it("swallows DB error when recording rewrite_invalid (covers line 658)", async () => {
    mockHappyPath();
    vi.mocked(execGit)
      .mockResolvedValueOnce({ code: 1, output: "patch fails" })
      .mockResolvedValueOnce({ code: 1, output: "retry fails" });
    vi.mocked(generateFixRewrite).mockResolvedValue({
      summary: "fix",
      reason: "fix",
      test_plan: ["test"],
      files: [{ path: "src/index.ts", content: "const x = 2;" }],
    });
    const longOriginal = Array(25)
      .fill("  function originalFoo() { return complexValue(); }")
      .join("\n");
    vi.mocked(fs.readFile)
      .mockResolvedValueOnce(longOriginal as any)
      .mockRejectedValue(new Error("ENOENT"));
    vi.mocked(recordAutoFixAttempt).mockRejectedValue(new Error("db gone"));
    const result = await autoFixIncident(input);
    expect(result.status).toBe("failed");
    expect(result.reason).toBe("rewrite_invalid");
  });

  it("swallows DB error when recording sandbox_validation_failed (covers line 772)", async () => {
    mockHappyPath();
    vi.mocked(runInSandbox).mockResolvedValue({ exitCode: 1, output: "FAIL" });
    vi.mocked(recordAutoFixAttempt).mockRejectedValue(new Error("db gone"));
    const result = await autoFixIncident(input);
    expect(result.status).toBe("failed");
    expect(result.reason).toBe("sandbox_validation_failed");
  });

  it("swallows DB error when recording dirty_repo (covers line 798)", async () => {
    mockHappyPath();
    vi.mocked(execGit)
      .mockResolvedValueOnce({ code: 0, output: "" })          // 1: apply workDir
      .mockResolvedValueOnce({ code: 0, output: "M file\n" }); // 2: status dirty
    vi.mocked(recordAutoFixAttempt).mockRejectedValue(new Error("db gone"));
    const result = await autoFixIncident(input);
    expect(result.status).toBe("failed");
    expect(result.reason).toBe("dirty_repo");
  });

  it("swallows DB error when recording git_checkout_base_failed (covers line 827)", async () => {
    mockHappyPath();
    vi.mocked(execGit)
      .mockResolvedValueOnce({ code: 0, output: "" }) // 1: apply workDir
      .mockResolvedValueOnce({ code: 0, output: "" }) // 2: status clean
      .mockResolvedValueOnce({ code: 1, output: "err" }); // 3: checkout main
    vi.mocked(recordAutoFixAttempt).mockRejectedValue(new Error("db gone"));
    const result = await autoFixIncident(input);
    expect(result.status).toBe("failed");
    expect(result.reason).toBe("git_checkout_base_failed");
  });

  it("swallows DB error when recording git_checkout_failed (covers line 861)", async () => {
    mockHappyPath();
    vi.mocked(execGit)
      .mockResolvedValueOnce({ code: 0, output: "" }) // 1: apply workDir
      .mockResolvedValueOnce({ code: 0, output: "" }) // 2: status clean
      .mockResolvedValueOnce({ code: 0, output: "" }) // 3: checkout main
      .mockResolvedValueOnce({ code: 0, output: "" }) // 4: apply repoPath
      .mockResolvedValueOnce({ code: 1, output: "exists" }); // 5: checkout -b
    vi.mocked(recordAutoFixAttempt).mockRejectedValue(new Error("db gone"));
    const result = await autoFixIncident(input);
    expect(result.status).toBe("failed");
    expect(result.reason).toBe("git_checkout_failed");
  });

  it("swallows DB error when recording pr_created (covers line 1001)", async () => {
    mockHappyPath();
    vi.mocked(recordAutoFixAttempt).mockRejectedValue(new Error("db gone"));
    const result = await autoFixIncident(input);
    // Error in the try-catch is swallowed; function still returns pr_created
    expect(result.status).toBe("pr_created");
  });

  it("swallows DB error when recording AUTO_FIX_REPO_PATH not configured (covers line 406)", async () => {
    vi.mocked(getConfig).mockReturnValue(
      baseConfig({ AUTO_FIX_REPO_PATH: "" }) as any
    );
    vi.mocked(getRecentAutoFixAttempts).mockResolvedValue([]);
    vi.mocked(getCachedRepoPath).mockResolvedValue("" as any);
    vi.mocked(recordAutoFixAttempt).mockRejectedValue(new Error("db gone"));
    const result = await autoFixIncident(input);
    expect(result.status).toBe("failed");
    expect(result.reason).toBe("AUTO_FIX_REPO_PATH not configured");
  });
});

// ─── Unexpected errors ────────────────────────────────────────────────────────

describe("autoFixIncident — unexpected errors", () => {
  it("catches unexpected exceptions and returns failed:unexpected_error", async () => {
    vi.mocked(getConfig).mockReturnValue(baseConfig() as any);
    vi.mocked(getRecentAutoFixAttempts).mockResolvedValue([]);
    vi.mocked(retrieveRepoContext).mockRejectedValue(new Error("boom"));
    vi.mocked(recordAutoFixAttempt).mockResolvedValue(undefined);
    vi.mocked(createIssueComment).mockResolvedValue({ created: true });
    const result = await autoFixIncident(input);
    expect(result.status).toBe("failed");
    expect(result.reason).toBe("unexpected_error");
    expect(recordAutoFixAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "failed", reason: "unexpected_error" })
    );
  });

  it("silently ignores persistence errors in the catch handler", async () => {
    vi.mocked(getConfig).mockReturnValue(baseConfig() as any);
    vi.mocked(getRecentAutoFixAttempts).mockResolvedValue([]);
    vi.mocked(retrieveRepoContext).mockRejectedValue(new Error("boom"));
    vi.mocked(recordAutoFixAttempt).mockRejectedValue(new Error("db gone"));
    vi.mocked(createIssueComment).mockResolvedValue({ created: true });
    const result = await autoFixIncident(input);
    expect(result.status).toBe("failed");
  });

  it("silently ignores issue comment failures in the catch handler", async () => {
    vi.mocked(getConfig).mockReturnValue(baseConfig() as any);
    vi.mocked(getRecentAutoFixAttempts).mockResolvedValue([]);
    vi.mocked(retrieveRepoContext).mockRejectedValue(new Error("boom"));
    vi.mocked(recordAutoFixAttempt).mockResolvedValue(undefined);
    vi.mocked(createIssueComment).mockRejectedValue(new Error("comment failed"));
    const result = await autoFixIncident(input);
    expect(result.status).toBe("failed");
  });
});
