import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { getConfig } from "../lib/config.js";
import { logger } from "../lib/logger.js";
import type { Incident, IncidentSummary } from "../lib/types.js";
import { generateFixProposal, generateFixRewrite } from "../lib/llm.js";
import { retrieveRepoContext } from "../rag/retrieveRepo.js";
import { runInSandbox } from "../tools/dockerSandbox.js";
import { createIssueComment, createPullRequest } from "../lib/github.js";
import { getCachedRepoPath } from "../rag/repoCache.js";

type AutoFixInput = {
  incident: Incident;
  summary?: IncidentSummary | null;
  issueNumber: number;
  issueUrl?: string;
};

type AutoFixResult = {
  status: "skipped" | "failed" | "pr_created";
  reason?: string;
  prUrl?: string;
};

const DENYLIST_PATHS = [".env", ".env.local", "secrets", "credentials"];
const IGNORED_COPY_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".cursor",
  ".next",
  ".turbo",
  "logs",
]);
const MAX_DIFF_BYTES = 200_000;
const MAX_FILE_BYTES = 500_000;

function severityRank(severity: string): number {
  switch (severity) {
    case "critical":
      return 4;
    case "high":
      return 3;
    case "medium":
      return 2;
    case "low":
    default:
      return 1;
  }
}

function shouldAutoFix(severity: string): boolean {
  const config = getConfig();
  if (config.AUTO_FIX_MODE !== "on") {
    return false;
  }
  if (config.AUTO_FIX_SEVERITY === "all") {
    return true;
  }
  return (
    severityRank(severity) >= severityRank(config.AUTO_FIX_SEVERITY)
  );
}

function normalizeDiff(diff: string): string {
  if (diff.includes("```")) {
    return diff.replace(/```[a-z]*\n?/g, "").replace(/```/g, "").trim();
  }
  return diff.trim();
}

function isUnifiedDiff(diff: string): boolean {
  return diff.includes("--- a/") && diff.includes("+++ b/") && diff.includes("@@");
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength)}…`;
}

async function commentInvalidDiff(
  issueNumber: number,
  diff: string
): Promise<void> {
  await createIssueComment(
    issueNumber,
    [
      "Auto-fix failed: invalid diff generated.",
      "",
      "```",
      truncate(diff, 800),
      "```",
    ].join("\n")
  );
}

function sanitizeDiff(diff: string): string {
  const lines = diff.split(/\r?\n/);
  const cleaned: string[] = [];
  for (const line of lines) {
    if (
      line.startsWith("diff --git ") ||
      line.startsWith("index ") ||
      line.startsWith("--- ") ||
      line.startsWith("+++ ") ||
      line.startsWith("@@") ||
      line.startsWith("+") ||
      line.startsWith("-") ||
      line.startsWith(" ") ||
      line.startsWith("\\")
    ) {
      cleaned.push(line);
    } else if (line.trim() === "") {
      cleaned.push(line);
    }
  }
  return cleaned.join("\n").trim() + "\n";
}

function resolveSafePath(root: string, relativePath: string): string {
  const resolved = path.resolve(root, relativePath);
  if (!resolved.startsWith(root)) {
    throw new Error(`Unsafe path: ${relativePath}`);
  }
  return resolved;
}

function resolveGitIdentity(): { name: string; email: string } {
  const config = getConfig();
  const owner = config.GITHUB_OWNER ?? "agentic-bot";
  return {
    name: config.GIT_USER_NAME ?? owner,
    email:
      config.GIT_USER_EMAIL ?? `${owner}@users.noreply.github.com`,
  };
}

async function applyRewriteFiles(
  root: string,
  files: Array<{ path: string; content: string }>
): Promise<void> {
  for (const file of files) {
    if (DENYLIST_PATHS.some((segment) => file.path.includes(segment))) {
      throw new Error(`Unsafe file in rewrite: ${file.path}`);
    }
    if (file.content.length > MAX_FILE_BYTES) {
      throw new Error(`Rewrite file too large: ${file.path}`);
    }
    const target = resolveSafePath(root, file.path);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, file.content, "utf8");
  }
}

async function validateRewriteFiles(
  basePath: string,
  files: Array<{ path: string; content: string }>
): Promise<{ ok: boolean; reason?: string }> {
  for (const file of files) {
    const originalPath = path.join(basePath, file.path);
    let original: string | null = null;
    try {
      original = await fs.readFile(originalPath, "utf8");
    } catch {
      original = null;
    }

    if (original) {
      const originalLines = original
        .split(/\r?\n/)
        .map((line) => line.trimEnd())
        .filter((line) => line.trim().length > 0);
      if (originalLines.length >= 20) {
        const anchors = [
          ...originalLines.slice(0, 3),
          ...originalLines.slice(-3),
        ];
        const matches = anchors.filter(
          (line) => line.length > 3 && file.content.includes(line)
        ).length;
        if (anchors.length > 0 && matches < 1) {
          return {
            ok: false,
            reason: `rewrite_missing_anchors:${file.path}`,
          };
        }
      }
      if (file.content.length < original.length * 0.5) {
        return {
          ok: false,
          reason: `rewrite_too_short:${file.path}`,
        };
      }
    }
  }
  return { ok: true };
}

function extractDiffFiles(diff: string): string[] {
  const files: string[] = [];
  const regex = /^diff --git a\/(.+?) b\/(.+)$/gm;
  let match: RegExpExecArray | null = null;
  while ((match = regex.exec(diff)) !== null) {
    files.push(match[2]);
  }
  if (files.length === 0) {
    const fallback = /^--- a\/(.+)$/gm;
    let fallbackMatch: RegExpExecArray | null = null;
    while ((fallbackMatch = fallback.exec(diff)) !== null) {
      files.push(fallbackMatch[1]);
    }
  }
  return files;
}

async function execGit(
  args: string[],
  cwd: string
): Promise<{ code: number; output: string }> {
  return new Promise((resolve) => {
    const child = spawn("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
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

async function copyRepo(source: string, target: string): Promise<void> {
  await fs.cp(source, target, {
    recursive: true,
    filter: (src) => {
      const relative = path.relative(source, src);
      if (!relative) {
        return true;
      }
      const parts = relative.split(path.sep);
      if (parts.some((part) => IGNORED_COPY_DIRS.has(part))) {
        return false;
      }
      return !DENYLIST_PATHS.some((segment) => relative.includes(segment));
    },
  });
}

async function applyPatch(diff: string, repoPath: string): Promise<string> {
  const patchFile = path.join(repoPath, ".agentic.patch");
  try {
    await fs.writeFile(patchFile, diff, "utf8");
    const result = await execGit(
      ["apply", "--whitespace=fix", patchFile],
      repoPath
    );
    if (result.code === 0) {
      return result.output;
    }

    const sanitized = sanitizeDiff(diff);
    if (sanitized !== diff) {
      logger.warn("Auto-fix patch sanitize retry", { repoPath });
      await fs.writeFile(patchFile, sanitized, "utf8");
      const retry = await execGit(
        ["apply", "--whitespace=fix", patchFile],
        repoPath
      );
      if (retry.code === 0) {
        return retry.output;
      }
      throw new Error(`git apply failed: ${retry.output}`);
    }

    throw new Error(`git apply failed: ${result.output}`);
  } finally {
    await fs.rm(patchFile, { force: true });
  }
}

async function isDockerRuntime(): Promise<boolean> {
  try {
    await fs.access("/.dockerenv");
    return true;
  } catch {
    return false;
  }
}

function buildPrBody(input: {
  template?: string;
  summary: string;
  reason: string;
  testPlan: string[];
  testOutput: string;
  safetyChecks: string[];
  issueNumber: number;
}): string {
  const base = input.template?.trim() || "# Summary\n\n## What changed\n\n## Why\n\n## Test plan\n";
  const withChanges = base.replace(
    "## What changed",
    `## What changed\n${input.summary}`
  );
  const withWhy = withChanges.replace("## Why", `## Why\n${input.reason}`);
  const testLines = input.testPlan.map((line) => `- ${line}`).join("\n");
  let body = withWhy.replace(
    "## Test plan",
    `## Test plan\n${testLines}\n\n**Test results**\n\`\`\`\n${input.testOutput}\n\`\`\``
  );
  if (input.safetyChecks.length > 0) {
    body += `\n\n## Safety checks\n${input.safetyChecks
      .map((line) => `- ${line}`)
      .join("\n")}`;
  }
  body += `\n\nCloses #${input.issueNumber}`;
  return body.trim();
}

export async function autoFixIncident(
  input: AutoFixInput
): Promise<AutoFixResult> {
  const config = getConfig();
  try {
    logger.info("Auto-fix evaluation", {
      incidentId: input.incident.id,
      severity: input.incident.severity,
      autoFixMode: config.AUTO_FIX_MODE,
      autoFixSeverity: config.AUTO_FIX_SEVERITY,
      issueNumber: input.issueNumber,
    });

    if (!shouldAutoFix(input.incident.severity)) {
      logger.info("Auto-fix skipped", {
        incidentId: input.incident.id,
        reason: "auto_fix_disabled_or_severity",
      });
      return { status: "skipped", reason: "auto_fix_disabled_or_severity" };
    }

    const autoFixPath = config.AUTO_FIX_REPO_PATH?.trim();
    const repoPath = autoFixPath ? autoFixPath : await getCachedRepoPath();
    if (!repoPath) {
      logger.warn("Auto-fix failed: repo path missing", {
        incidentId: input.incident.id,
      });
      return { status: "failed", reason: "AUTO_FIX_REPO_PATH not configured" };
    }
    logger.info("Auto-fix repo resolved", {
      incidentId: input.incident.id,
      repoPath,
    });

    const query = [
      input.incident.title,
      input.summary?.summary,
      input.incident.evidence.join("\n"),
    ]
      .filter(Boolean)
      .join("\n");

    const repoContext = await retrieveRepoContext(query);
    logger.info("Auto-fix repo context retrieved", {
      incidentId: input.incident.id,
      chunks: repoContext.length,
    });
    const contextPayload = repoContext.map((item) => ({
      path: item.path,
      content: item.content,
    }));

    const buildProposal = async () =>
      generateFixProposal({
        incident: input.incident,
        repoContext: contextPayload,
        strictDiff: true,
      });

    let proposal = await buildProposal();
    let diff = "";
    let touchedFiles: string[] = [];
    let fixSummary = "";
    let fixReason = "";
    let testPlan: string[] = [];
    let rewrite: {
      summary: string;
      reason: string;
      test_plan: string[];
      files: Array<{ path: string; content: string }>;
    } | null = null;

    const setFromProposal = (current: {
      summary: string;
      reason: string;
      test_plan: string[];
      diff: string;
    }) => {
      fixSummary = current.summary;
      fixReason = current.reason;
      testPlan = current.test_plan;
      diff = normalizeDiff(current.diff);
      touchedFiles = extractDiffFiles(diff);
    };

    const validateDiff = (): "invalid_diff" | "diff_too_large" | null => {
      if (!isUnifiedDiff(diff) || touchedFiles.length === 0) {
        return "invalid_diff";
      }
      if (diff.length > MAX_DIFF_BYTES) {
        return "diff_too_large";
      }
      return null;
    };

    if (proposal) {
      setFromProposal(proposal);
      const status = validateDiff();
      if (status === "diff_too_large") {
        await createIssueComment(
          input.issueNumber,
          "Auto-fix failed: diff too large."
        );
        return { status: "failed", reason: "diff_too_large" };
      }
      if (status === "invalid_diff") {
        proposal = null;
      }
    }

    if (!proposal) {
      rewrite = await generateFixRewrite({
        incident: input.incident,
        repoContext: contextPayload,
      });
      if (!rewrite) {
        await commentInvalidDiff(input.issueNumber, diff || "No diff produced.");
        return { status: "failed", reason: "invalid_diff" };
      }
      const rewriteCheck = await validateRewriteFiles(repoPath, rewrite.files);
      if (!rewriteCheck.ok) {
        await createIssueComment(
          input.issueNumber,
          `Auto-fix failed: rewrite validation failed (${rewriteCheck.reason})`
        );
        return { status: "failed", reason: "rewrite_invalid" };
      }
      fixSummary = rewrite.summary;
      fixReason = rewrite.reason;
      testPlan = rewrite.test_plan;
      touchedFiles = rewrite.files.map((file) => file.path);
    }

    const unsafeFile = touchedFiles.find((file) =>
      DENYLIST_PATHS.some((segment) => file.includes(segment))
    );
    if (unsafeFile) {
      logger.warn("Auto-fix blocked: unsafe file in diff", {
        incidentId: input.incident.id,
        unsafeFile,
      });
      await createIssueComment(
        input.issueNumber,
        `Auto-fix blocked: unsafe file in diff (${unsafeFile}).`
      );
      return { status: "failed", reason: "unsafe_files" };
    }

    const workspaceRoot = path.join(path.dirname(repoPath), ".workspaces");
    await fs.mkdir(workspaceRoot, { recursive: true });
    const tempDir = await fs.mkdtemp(path.join(workspaceRoot, "agentic-fix-"));
    const workDir = path.join(tempDir, "repo");
    await copyRepo(repoPath, workDir);

    try {
      if (rewrite) {
        await applyRewriteFiles(workDir, rewrite.files);
      } else {
        await applyPatch(diff, workDir);
      }
    } catch (error) {
      logger.warn("Auto-fix patch apply failed, trying rewrite fallback", {
        incidentId: input.incident.id,
        error: String(error),
      });
      rewrite = await generateFixRewrite({
        incident: input.incident,
        repoContext: contextPayload,
      });
      if (!rewrite) {
        await createIssueComment(
          input.issueNumber,
          `Auto-fix failed: ${String(error)}`
        );
        return { status: "failed", reason: "invalid_diff" };
      }
      const rewriteCheck = await validateRewriteFiles(repoPath, rewrite.files);
      if (!rewriteCheck.ok) {
        await createIssueComment(
          input.issueNumber,
          `Auto-fix failed: rewrite validation failed (${rewriteCheck.reason})`
        );
        return { status: "failed", reason: "rewrite_invalid" };
      }
      fixSummary = rewrite.summary;
      fixReason = rewrite.reason;
      testPlan = rewrite.test_plan;
      touchedFiles = rewrite.files.map((file) => file.path);
      await applyRewriteFiles(workDir, rewrite.files);
    }

    logger.info("Auto-fix patch applied in sandbox workdir", {
      incidentId: input.incident.id,
      workDir,
    });

    const inDocker = await isDockerRuntime();
    const volumesFrom = inDocker ? process.env.HOSTNAME : undefined;
    const testCommand = config.AUTO_FIX_TEST_COMMAND;
    const installCommand = config.AUTO_FIX_INSTALL_COMMAND?.trim();
    const packageJsonPath = path.join(workDir, "package.json");
    let hasPackageJson = false;
    try {
      await fs.access(packageJsonPath);
      hasPackageJson = true;
    } catch {
      hasPackageJson = false;
    }
    if (installCommand && hasPackageJson) {
      logger.info("Auto-fix running sandbox install", {
        incidentId: input.incident.id,
        installCommand,
      });
      const installResult = await runInSandbox({
        image: config.AUTO_FIX_SANDBOX_IMAGE,
        command: ["/bin/sh", "-lc", installCommand],
        workdir: inDocker ? workDir : "/workspace",
        mounts: inDocker
          ? undefined
          : [{ hostPath: workDir, containerPath: "/workspace", mode: "rw" }],
        volumesFrom,
        timeoutMs: 15 * 60 * 1000,
      });
      if (installResult.exitCode !== 0) {
        logger.warn("Auto-fix failed: sandbox install failed", {
          incidentId: input.incident.id,
          exitCode: installResult.exitCode,
        });
        await createIssueComment(
          input.issueNumber,
          [
            "Auto-fix failed during sandbox install.",
            "",
            "```",
            installResult.output.slice(-4000),
            "```",
          ].join("\n")
        );
        return { status: "failed", reason: "sandbox_install_failed" };
      }
    }

    logger.info("Auto-fix running sandbox tests", {
      incidentId: input.incident.id,
      testCommand,
      image: config.AUTO_FIX_SANDBOX_IMAGE,
    });
    const sandboxResult = await runInSandbox({
      image: config.AUTO_FIX_SANDBOX_IMAGE,
      command: ["/bin/sh", "-lc", testCommand],
      workdir: inDocker ? workDir : "/workspace",
      mounts: inDocker
        ? undefined
        : [{ hostPath: workDir, containerPath: "/workspace", mode: "rw" }],
      volumesFrom,
      timeoutMs: 15 * 60 * 1000,
    });

    if (sandboxResult.exitCode !== 0) {
      logger.warn("Auto-fix failed: sandbox validation failed", {
        incidentId: input.incident.id,
        exitCode: sandboxResult.exitCode,
      });
      await createIssueComment(
        input.issueNumber,
        [
          "Auto-fix failed during sandbox validation.",
          "",
          "```",
          sandboxResult.output.slice(-4000),
          "```",
        ].join("\n")
      );
      return { status: "failed", reason: "sandbox_validation_failed" };
    }
    logger.info("Auto-fix sandbox validation passed", {
      incidentId: input.incident.id,
    });

    const status = await execGit(["status", "--porcelain"], repoPath);
    if (status.output.trim().length > 0) {
      logger.warn("Auto-fix aborted: repo has uncommitted changes", {
        incidentId: input.incident.id,
      });
      await createIssueComment(
        input.issueNumber,
        "Auto-fix aborted: repo has uncommitted changes."
      );
      return { status: "failed", reason: "dirty_repo" };
    }

    logger.info("Auto-fix applying patch to repo", {
      incidentId: input.incident.id,
    });
    const checkoutBase = await execGit(
      ["checkout", config.GITHUB_DEFAULT_BRANCH],
      repoPath
    );
    if (checkoutBase.code !== 0) {
      logger.warn("Auto-fix failed: checkout base branch failed", {
        incidentId: input.incident.id,
      });
      await createIssueComment(
        input.issueNumber,
        `Auto-fix failed: git checkout base error\n\n\`\`\`\n${checkoutBase.output}\n\`\`\``
      );
      return { status: "failed", reason: "git_checkout_base_failed" };
    }

    if (rewrite) {
      await applyRewriteFiles(repoPath, rewrite.files);
    } else {
      await applyPatch(diff, repoPath);
    }

    const branchName = `${config.AUTO_FIX_BRANCH_PREFIX}/${input.incident.id}`;
    logger.info("Auto-fix creating branch", {
      incidentId: input.incident.id,
      branch: branchName,
    });
    const checkout = await execGit(["checkout", "-b", branchName], repoPath);
    if (checkout.code !== 0) {
      logger.warn("Auto-fix failed: git checkout branch failed", {
        incidentId: input.incident.id,
      });
      await createIssueComment(
        input.issueNumber,
        `Auto-fix failed: git checkout error\n\n\`\`\`\n${checkout.output}\n\`\`\``
      );
      return { status: "failed", reason: "git_checkout_failed" };
    }

    const identity = resolveGitIdentity();
    await execGit(["config", "user.name", identity.name], repoPath);
    await execGit(["config", "user.email", identity.email], repoPath);
    logger.info("Auto-fix git identity set", {
      incidentId: input.incident.id,
      name: identity.name,
      email: identity.email,
    });

    await execGit(["add", "-A"], repoPath);
    const commit = await execGit(
      ["commit", "-m", `fix: ${input.incident.title}`],
      repoPath
    );
    if (commit.code !== 0) {
      logger.warn("Auto-fix failed: git commit failed", {
        incidentId: input.incident.id,
      });
      await createIssueComment(
        input.issueNumber,
        `Auto-fix failed: git commit error\n\n\`\`\`\n${commit.output}\n\`\`\``
      );
      return { status: "failed", reason: "git_commit_failed" };
    }

    const push = await execGit(["push", "-u", "origin", branchName], repoPath);
    if (push.code !== 0) {
      logger.warn("Auto-fix failed: git push failed", {
        incidentId: input.incident.id,
      });
      await createIssueComment(
        input.issueNumber,
        `Auto-fix failed: git push error\n\n\`\`\`\n${push.output}\n\`\`\``
      );
      return { status: "failed", reason: "git_push_failed" };
    }

    let template: string | undefined;
    try {
      template = await fs.readFile(
        path.join(repoPath, ".github", "pull_request_template.md"),
        "utf8"
      );
    } catch {
      template = undefined;
    }

    const prBody = buildPrBody({
      template,
      summary: fixSummary,
      reason: fixReason,
      testPlan,
      testOutput: sandboxResult.output.slice(-4000),
      safetyChecks: [
        `Denylist check passed (${touchedFiles.length} files)`,
        `Sandbox tests passed: ${testCommand}`,
        rewrite ? "Rewrite fallback used" : "Diff apply used",
      ],
      issueNumber: input.issueNumber,
    });

    logger.info("Auto-fix opening PR", {
      incidentId: input.incident.id,
      branch: branchName,
    });
    const pr = await createPullRequest({
      title: `fix: ${input.incident.title}`,
      body: prBody,
      head: branchName,
      base: config.GITHUB_DEFAULT_BRANCH,
      labels: ["autofix"],
    });

    if (!pr.created) {
      logger.warn("Auto-fix failed: PR creation failed", {
        incidentId: input.incident.id,
        reason: pr.reason ?? "unknown",
      });
      await createIssueComment(
        input.issueNumber,
        `Auto-fix failed to open PR: ${pr.reason ?? "unknown error"}`
      );
      return { status: "failed", reason: "pr_create_failed" };
    }

    logger.info("Auto-fix PR created", {
      incidentId: input.incident.id,
      url: pr.url,
    });
    await createIssueComment(
      input.issueNumber,
      `Auto-fix PR created: ${pr.url}`
    );

    return { status: "pr_created", prUrl: pr.url };
  } catch (error) {
    logger.warn("Auto-fix failed: unexpected error", {
      incidentId: input.incident.id,
      error: String(error),
    });
    try {
      await createIssueComment(
        input.issueNumber,
        `Auto-fix failed: ${String(error)}`
      );
    } catch {
      // Ignore comment failures.
    }
    return { status: "failed", reason: "unexpected_error" };
  }
}
