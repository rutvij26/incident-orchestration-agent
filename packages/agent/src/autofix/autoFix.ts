import fs from "node:fs/promises";
import path from "node:path";
import { getConfig } from "../lib/config.js";
import { logger } from "../lib/logger.js";
import type { Incident, IncidentSummary } from "../lib/types.js";
import {
  assessFixability,
  generateFixPlan,
  generateFixProposal,
  generateFixRewrite,
  verifyFixPatch,
} from "../lib/llm.js";
import type { FixPlan } from "../lib/llm.js";
import { retrieveRepoContext } from "../rag/retrieveRepo.js";
import { runInSandbox } from "../tools/dockerSandbox.js";
import { createIssueComment, createPullRequest } from "../lib/github.js";
import { resolveRepoTarget } from "../lib/repoTarget.js";
import { getCachedRepoPath } from "../rag/repoCache.js";
import {
  getRecentAutoFixAttempts,
  recordAutoFixAttempt,
} from "../memory/postgres.js";
import { severityRank } from "../lib/severity.js";
import { execGit } from "../lib/git.js";

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

function heuristicFixabilityScore(params: {
  severity: string;
  repoContextLength: number;
  summaryConfidence?: number | null;
}): number {
  const severityBonus =
    severityRank(params.severity) / 4; // 0.25 .. 1.0
  const ragBonus = Math.min(1, params.repoContextLength / 6) * 0.4;
  const confidenceBonus = (params.summaryConfidence ?? 0.5) * 0.35;
  return Math.min(1, 0.35 + severityBonus * 0.25 + ragBonus + confidenceBonus);
}

async function computeFixabilityScore(params: {
  incident: Incident;
  repoContext: Array<{ path: string; content: string }>;
  summaryConfidence?: number | null;
}): Promise<{ score: number; reason?: string }> {
  const heuristic = heuristicFixabilityScore({
    severity: params.incident.severity,
    repoContextLength: params.repoContext.length,
    summaryConfidence: params.summaryConfidence,
  });
  const assessment = await assessFixability({
    incident: params.incident,
    repoContext: params.repoContext,
  });
  if (!assessment) {
    return { score: heuristic };
  }
  const combined = 0.6 * assessment.fixability_score + 0.4 * heuristic;
  return {
    score: Math.min(1, Math.max(0, combined)),
    reason: assessment.reason,
  };
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
  const normalizedRoot = path.resolve(root);
  const resolved = path.resolve(normalizedRoot, relativePath);
  if (!resolved.startsWith(normalizedRoot)) {
    throw new Error(`Unsafe path: ${relativePath}`);
  }
  return resolved;
}

function resolveGitIdentity(): { name: string; email: string } {
  const config = getConfig();
  const repoTarget = resolveRepoTarget();
  const owner = repoTarget?.owner ?? config.GITHUB_OWNER ?? "agentic-bot";
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

async function readCurrentFiles(
  repoPath: string,
  filePaths: string[],
): Promise<Array<{ path: string; content: string }>> {
  const results: Array<{ path: string; content: string }> = [];
  for (const filePath of filePaths) {
    try {
      const content = await fs.readFile(path.join(repoPath, filePath), "utf8");
      results.push({ path: filePath, content });
    } catch {
      // file not readable — skip; LLM will fall back to RAG context
    }
  }
  return results;
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

async function copyRepo(source: string, target: string): Promise<void> {
  await fs.cp(source, target, {
    recursive: true,
    /* v8 ignore next 12 - filter callback is not invoked when fs.cp is mocked in unit tests */
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

/**
 * When the LLM has no repo context it guesses short relative paths like
 * `src/index.ts` instead of the monorepo path `apps/demo-services/src/index.ts`.
 * This function uses `git ls-files` to find the real path for any path in the
 * diff that doesn't exist in the working tree, then rewrites the diff.
 * Returns the remapped diff, or null when nothing needed remapping.
 */
async function remapDiffPaths(
  diff: string,
  repoPath: string,
): Promise<string | null> {
  const diffPaths = extractDiffFiles(diff);
  if (diffPaths.length === 0) return null;

  const lsResult = await execGit(["ls-files"], repoPath);
  if (lsResult.code !== 0) return null;
  const trackedFiles = lsResult.output.trim().split("\n").filter(Boolean);

  const remapped = new Map<string, string>();
  for (const diffPath of diffPaths) {
    const normalised = diffPath.replace(/\\/g, "/");
    try {
      await fs.access(path.join(repoPath, normalised));
      continue; // path exists as-is, no remap needed
    } catch {
      // fall through to search
    }
    const basename = path.basename(normalised);
    const candidates = trackedFiles.filter(
      (f) => f === normalised || f.endsWith(`/${basename}`),
    );
    if (candidates.length === 1) {
      remapped.set(normalised, candidates[0]);
    } else if (candidates.length > 1) {
      // Prefer a candidate that ends with the same relative suffix
      const best =
        candidates.find((c) => c.endsWith(normalised)) ?? candidates[0];
      remapped.set(normalised, best);
    }
  }
  if (remapped.size === 0) return null;

  let patched = diff;
  for (const [oldPath, newPath] of remapped) {
    patched = patched
      .replace(new RegExp(`a/${escapeRegex(oldPath)}`, "g"), `a/${newPath}`)
      .replace(new RegExp(`b/${escapeRegex(oldPath)}`, "g"), `b/${newPath}`);
  }
  logger.info("Auto-fix diff paths remapped", {
    remapped: Object.fromEntries(remapped),
  });
  return patched;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

    // sanitizeDiff normalises whitespace and always produces a different string (adds trailing \n);
    // retry once with the cleaned patch before giving up.
    const sanitized = sanitizeDiff(diff);
    logger.warn("Auto-fix patch sanitize retry", { repoPath });
    await fs.writeFile(patchFile, sanitized, "utf8");
    const retry = await execGit(
      ["apply", "--whitespace=fix", patchFile],
      repoPath
    );
    if (retry.code === 0) {
      return retry.output;
    }

    // Last resort: remap wrong paths (e.g. `src/index.ts` → tracked real path).
    const remapped = await remapDiffPaths(sanitized, repoPath);
    if (remapped) {
      await fs.writeFile(patchFile, remapped, "utf8");
      const remappedResult = await execGit(
        ["apply", "--whitespace=fix", patchFile],
        repoPath,
      );
      if (remappedResult.code === 0) return remappedResult.output;
    }

    throw new Error(`git apply failed: ${retry.output}`);
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
  let recordedFixabilityScore: number | undefined;
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

    const skipAfterFailures = config.AUTO_FIX_SKIP_AFTER_FAILURES;
    if (skipAfterFailures > 0) {
      try {
        const recent = await getRecentAutoFixAttempts({
          incidentId: input.incident.id,
          issueNumber: input.issueNumber,
          limit: 20,
        });
        const failureCount = recent.filter((r) => r.outcome === "failed").length;
        if (failureCount >= skipAfterFailures) {
          logger.info("Auto-fix skipped: repeated failures", {
            incidentId: input.incident.id,
            issueNumber: input.issueNumber,
            failureCount,
          });
          return {
            status: "skipped",
            reason: "repeated_failures",
          };
        }
      } catch (err) {
        logger.warn("Auto-fix: could not check past attempts", {
          error: String(err),
        });
      }
    }

    const autoFixPath = config.AUTO_FIX_REPO_PATH?.trim();
    const repoPath = autoFixPath ? autoFixPath : await getCachedRepoPath();
    if (!repoPath) {
      logger.warn("Auto-fix failed: repo path missing", {
        incidentId: input.incident.id,
      });
      try {
        await recordAutoFixAttempt({
          incidentId: input.incident.id,
          issueNumber: input.issueNumber,
          outcome: "failed",
          reason: "AUTO_FIX_REPO_PATH not configured",
        });
      } catch {
        /* ignore */
      }
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

    const { score: fixabilityScore, reason: fixabilityReason } =
      await computeFixabilityScore({
        incident: input.incident,
        repoContext: contextPayload,
        summaryConfidence: input.summary?.confidence,
      });
    const minScore = config.AUTO_FIX_MIN_SCORE;
    if (fixabilityScore < minScore) {
      logger.info("Auto-fix skipped: fixability below threshold", {
        incidentId: input.incident.id,
        fixabilityScore,
        minScore,
        fixabilityReason,
      });
      try {
        await recordAutoFixAttempt({
          incidentId: input.incident.id,
          issueNumber: input.issueNumber,
          outcome: "skipped",
          reason: "fixability_below_threshold",
          fixabilityScore,
        });
      } catch {
        // ignore persistence errors
      }
      return {
        status: "skipped",
        reason: "fixability_below_threshold",
      };
    }
    recordedFixabilityScore = fixabilityScore;

    if (contextPayload.length === 0) {
      logger.warn(
        "Auto-fix proceeding without repo context — RAG returned no chunks; fix quality will be degraded",
        { incidentId: input.incident.id },
      );
    }

    // Get the authoritative file list from the repo so every LLM prompt is
    // grounded with real tracked paths.  The LLM is instructed to ONLY use
    // paths from this list, which prevents it from inventing paths like
    // `src/index.ts` when the real file is `apps/demo-services/src/index.ts`.
    const SOURCE_EXTENSIONS = [
      ".ts", ".tsx", ".mts", ".cts",
      ".js", ".jsx", ".mjs", ".cjs",
      ".py", ".go", ".java", ".rb", ".rs", ".cs",
    ];
    const lsResult = await execGit(["ls-files"], repoPath);
    const trackedFiles = lsResult.code === 0
      ? lsResult.output
          .split("\n")
          .map((f) => f.trim())
          .filter((f) => f && SOURCE_EXTENSIONS.some((ext) => f.endsWith(ext)))
          .slice(0, 300)
      : [];
    logger.info("Auto-fix tracked source files catalogued", {
      incidentId: input.incident.id,
      count: trackedFiles.length,
    });

    // Plan step: now that every prompt includes the full tracked file list,
    // the LLM can select real paths even when RAG returned 0 chunks.
    const plan: FixPlan | null = await generateFixPlan({
      incident: input.incident,
      repoContext: contextPayload,
      trackedFiles,
    });
    let patchContext = contextPayload;
    if (plan) {
      logger.info("Auto-fix plan generated", {
        incidentId: input.incident.id,
        planFiles: plan.files,
        approach: plan.approach,
      });
      const planFileSet = new Set(plan.files);
      const filtered = contextPayload.filter((c) => planFileSet.has(c.path));
      if (filtered.length > 0) {
        patchContext = filtered;
      }
    }

    const buildProposal = async () =>
      generateFixProposal({
        incident: input.incident,
        repoContext: patchContext,
        strictDiff: true,
        plan: plan ?? undefined,
        trackedFiles,
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
        try {
          await recordAutoFixAttempt({
            incidentId: input.incident.id,
            issueNumber: input.issueNumber,
            outcome: "failed",
            reason: "diff_too_large",
            fixabilityScore: recordedFixabilityScore,
          });
        } catch {
          /* ignore */
        }
        return { status: "failed", reason: "diff_too_large" };
      }
      if (status === "invalid_diff") {
        proposal = null;
      } else if (plan) {
        // Verify step: check the generated patch aligns with the plan
        const verification = await verifyFixPatch({
          incident: input.incident,
          plan,
          diff,
        });
        if (verification) {
          logger.info("Auto-fix patch verification result", {
            incidentId: input.incident.id,
            valid: verification.valid,
            confidence: verification.confidence,
            verdict: verification.verdict,
          });
          if (!verification.valid && verification.confidence >= 0.7) {
            logger.warn("Auto-fix patch rejected by verification", {
              incidentId: input.incident.id,
              issues: verification.issues,
            });
            proposal = null;
          }
        }
      }
    }

    if (!proposal) {
      // Provide the LLM with the full current file contents so it can output
      // a complete corrected version — prevents anchor-check failures caused by
      // the LLM only seeing RAG chunks and inventing missing boilerplate.
      const rewriteFilePaths = plan?.files.length
        ? plan.files
        : [...new Set(contextPayload.map((c) => c.path))];
      const currentFiles = await readCurrentFiles(repoPath, rewriteFilePaths);

      rewrite = await generateFixRewrite({
        incident: input.incident,
        repoContext: contextPayload,
        trackedFiles,
        currentFiles,
      });
      if (!rewrite) {
        await commentInvalidDiff(input.issueNumber, diff || "No diff produced.");
        try {
          await recordAutoFixAttempt({
            incidentId: input.incident.id,
            issueNumber: input.issueNumber,
            outcome: "failed",
            reason: "invalid_diff",
            fixabilityScore: recordedFixabilityScore,
          });
        } catch {
          /* ignore */
        }
        return { status: "failed", reason: "invalid_diff" };
      }

      const rewriteCheck = await validateRewriteFiles(repoPath, rewrite.files);
      if (!rewriteCheck.ok) {
        await createIssueComment(
          input.issueNumber,
          `Auto-fix failed: rewrite validation failed (${rewriteCheck.reason})`
        );
        try {
          await recordAutoFixAttempt({
            incidentId: input.incident.id,
            issueNumber: input.issueNumber,
            outcome: "failed",
            reason: "rewrite_invalid",
            fixabilityScore: recordedFixabilityScore,
          });
        } catch {
          /* ignore */
        }
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
      try {
        await recordAutoFixAttempt({
          incidentId: input.incident.id,
          issueNumber: input.issueNumber,
          outcome: "failed",
          reason: "unsafe_files",
          fixabilityScore: recordedFixabilityScore,
        });
      } catch {
        /* ignore */
      }
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
      // Re-read current files from the original repoPath (workDir may be partially modified).
      const fallbackFilePaths = plan?.files.length
        ? plan.files
        : [...new Set(contextPayload.map((c) => c.path))];
      const fallbackCurrentFiles = await readCurrentFiles(repoPath, fallbackFilePaths);

      rewrite = await generateFixRewrite({
        incident: input.incident,
        repoContext: contextPayload,
        trackedFiles,
        currentFiles: fallbackCurrentFiles,
      });
      if (!rewrite) {
        await createIssueComment(
          input.issueNumber,
          `Auto-fix failed: ${String(error)}`
        );
        try {
          await recordAutoFixAttempt({
            incidentId: input.incident.id,
            issueNumber: input.issueNumber,
            outcome: "failed",
            reason: "invalid_diff",
            fixabilityScore: recordedFixabilityScore,
          });
        } catch {
          /* ignore */
        }
        return { status: "failed", reason: "invalid_diff" };
      }
      const rewriteCheck = await validateRewriteFiles(repoPath, rewrite.files);
      if (!rewriteCheck.ok) {
        await createIssueComment(
          input.issueNumber,
          `Auto-fix failed: rewrite validation failed (${rewriteCheck.reason})`
        );
        try {
          await recordAutoFixAttempt({
            incidentId: input.incident.id,
            issueNumber: input.issueNumber,
            outcome: "failed",
            reason: "rewrite_invalid",
            fixabilityScore: recordedFixabilityScore,
          });
        } catch {
          /* ignore */
        }
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
        try {
          await recordAutoFixAttempt({
            incidentId: input.incident.id,
            issueNumber: input.issueNumber,
            outcome: "failed",
            reason: "sandbox_install_failed",
            fixabilityScore: recordedFixabilityScore,
          });
        } catch {
          /* ignore */
        }
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
      try {
        await recordAutoFixAttempt({
          incidentId: input.incident.id,
          issueNumber: input.issueNumber,
          outcome: "failed",
          reason: "sandbox_validation_failed",
          fixabilityScore: recordedFixabilityScore,
        });
      } catch {
        /* ignore */
      }
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
      try {
        await recordAutoFixAttempt({
          incidentId: input.incident.id,
          issueNumber: input.issueNumber,
          outcome: "failed",
          reason: "dirty_repo",
          fixabilityScore: recordedFixabilityScore,
        });
      } catch {
        /* ignore */
      }
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
      try {
        await recordAutoFixAttempt({
          incidentId: input.incident.id,
          issueNumber: input.issueNumber,
          outcome: "failed",
          reason: "git_checkout_base_failed",
          fixabilityScore: recordedFixabilityScore,
        });
      } catch {
        /* ignore */
      }
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
      try {
        await recordAutoFixAttempt({
          incidentId: input.incident.id,
          issueNumber: input.issueNumber,
          outcome: "failed",
          reason: "git_checkout_failed",
          fixabilityScore: recordedFixabilityScore,
        });
      } catch {
        /* ignore */
      }
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
      try {
        await recordAutoFixAttempt({
          incidentId: input.incident.id,
          issueNumber: input.issueNumber,
          outcome: "failed",
          reason: "git_commit_failed",
          fixabilityScore: recordedFixabilityScore,
        });
      } catch {
        /* ignore */
      }
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
      try {
        await recordAutoFixAttempt({
          incidentId: input.incident.id,
          issueNumber: input.issueNumber,
          outcome: "failed",
          reason: "git_push_failed",
          fixabilityScore: recordedFixabilityScore,
        });
      } catch {
        /* ignore */
      }
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
      try {
        await recordAutoFixAttempt({
          incidentId: input.incident.id,
          issueNumber: input.issueNumber,
          outcome: "failed",
          reason: "pr_create_failed",
          fixabilityScore: recordedFixabilityScore,
        });
      } catch {
        /* ignore */
      }
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

    try {
      await recordAutoFixAttempt({
        incidentId: input.incident.id,
        issueNumber: input.issueNumber,
        outcome: "pr_created",
        fixabilityScore: recordedFixabilityScore,
      });
    } catch {
      /* ignore */
    }
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
    try {
      await recordAutoFixAttempt({
        incidentId: input.incident.id,
        issueNumber: input.issueNumber,
        outcome: "failed",
        reason: "unexpected_error",
        fixabilityScore: recordedFixabilityScore,
      });
    } catch {
      /* ignore */
    }
    return { status: "failed", reason: "unexpected_error" };
  }
}
