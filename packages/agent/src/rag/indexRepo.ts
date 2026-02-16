import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { getConfig } from "../lib/config.js";
import { logger } from "../lib/logger.js";
import { embedText } from "../lib/embeddings.js";
import {
  cleanupRepoChunks,
  deleteRepoChunksForPath,
  getRepoChunkHashes,
  getRepoIndexState,
  hasRepoEmbeddings,
  initRepoMemory,
  listRepoPaths,
  setRepoIndexState,
  upsertRepoChunks,
} from "../memory/repo.js";
import { resolveRepoKey } from "../lib/repoTarget.js";
import { getCachedRepoPath } from "./repoCache.js";

const IGNORED_DIRS = new Set([
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

const IGNORED_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".pdf",
  ".zip",
  ".tar",
  ".gz",
  ".lock",
]);

const MAX_FILE_BYTES = 300_000;

type Chunk = {
  repoKey: string;
  path: string;
  chunkIndex: number;
  content: string;
  contentHash: string;
  embedding: number[] | null;
};

type ChunkBuildResult = {
  chunks: Chunk[];
  totalChunks: number;
  skipped: boolean;
};

function isIgnored(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  if (IGNORED_EXTENSIONS.has(ext)) {
    return true;
  }
  const parts = filePath.split(path.sep);
  return parts.some((part) => IGNORED_DIRS.has(part));
}

function chunkText(
  content: string,
  chunkSize: number,
  overlap: number
): string[] {
  if (content.length <= chunkSize) {
    return [content];
  }
  const chunks: string[] = [];
  let start = 0;
  while (start < content.length) {
    const end = Math.min(start + chunkSize, content.length);
    const chunk = content.slice(start, end);
    chunks.push(chunk);
    if (end === content.length) {
      break;
    }
    start = Math.max(0, end - overlap);
  }
  return chunks;
}

async function isBinaryFile(buffer: Buffer): Promise<boolean> {
  const sample = buffer.subarray(0, 1000);
  return sample.includes(0);
}

async function walkFiles(root: string): Promise<string[]> {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const resolved = path.join(root, entry.name);
    if (isIgnored(resolved)) {
      continue;
    }
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(resolved)));
    } else if (entry.isFile()) {
      files.push(resolved);
    }
  }
  return files;
}

function hashContent(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

async function execGit(
  args: string[],
  cwd: string
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

async function getRepoHeadSha(repoPath: string): Promise<string | null> {
  const result = await execGit(["rev-parse", "HEAD"], repoPath);
  if (result.code !== 0) {
    return null;
  }
  return result.output.trim() || null;
}

async function buildChunks(
  repoPath: string,
  filePath: string,
  relativePath: string,
  chunkSize: number,
  overlap: number,
  repoKey: string,
  existingHashes: Map<number, string>
): Promise<ChunkBuildResult> {
  const stats = await fs.stat(filePath);
  if (stats.size > MAX_FILE_BYTES) {
    return { chunks: [], totalChunks: 0, skipped: true };
  }
  const raw = await fs.readFile(filePath);
  if (await isBinaryFile(raw)) {
    return { chunks: [], totalChunks: 0, skipped: true };
  }
  const content = raw.toString("utf8");
  const chunks = chunkText(content, chunkSize, overlap);
  const results: Chunk[] = [];
  for (let i = 0; i < chunks.length; i += 1) {
    const chunkContent = chunks[i];
    const contentHash = hashContent(chunkContent);
    if (existingHashes.get(i) === contentHash) {
      continue;
    }
    const embedding = await embedText(chunkContent);
    results.push({
      repoKey,
      path: relativePath,
      chunkIndex: i,
      content: chunkContent,
      contentHash,
      embedding,
    });
  }
  return { chunks: results, totalChunks: chunks.length, skipped: false };
}

export async function indexRepository(): Promise<void> {
  const config = getConfig();
  const ragPath = config.RAG_REPO_PATH?.trim();
  const autoFixPath = config.AUTO_FIX_REPO_PATH?.trim();
  const repoPath = ragPath || autoFixPath || (await getCachedRepoPath());
  const repoKey = resolveRepoKey(repoPath) ?? repoPath;
  const headSha = await getRepoHeadSha(repoPath);

  logger.info("Starting repo indexing", { repoPath });
  await initRepoMemory();
  const hasEmbeddings = await hasRepoEmbeddings(repoKey);
  const existingState = await getRepoIndexState(repoKey);
  if (headSha && existingState?.headSha === headSha && hasEmbeddings) {
    logger.info("Repo indexing skipped (unchanged)", { repoKey, headSha });
    return;
  }
  if (!headSha) {
    logger.info("Repo head SHA unavailable; indexing without cache check", {
      repoKey,
    });
  }

  const files = await walkFiles(repoPath);
  logger.info("Repo files discovered", { count: files.length });
  const existingPaths = await listRepoPaths(repoKey);
  const currentPaths = new Set<string>();

  for (const filePath of files) {
    try {
      const relativePath = path.relative(repoPath, filePath);
      currentPaths.add(relativePath);
      const existingHashes = await getRepoChunkHashes(repoKey, relativePath);
      const result = await buildChunks(
        repoPath,
        filePath,
        relativePath,
        config.RAG_CHUNK_SIZE,
        config.RAG_CHUNK_OVERLAP,
        repoKey,
        existingHashes
      );
      if (result.skipped) {
        if (existingHashes.size > 0) {
          await deleteRepoChunksForPath(repoKey, relativePath);
          logger.info("Removed non-text file from index", {
            path: relativePath,
          });
        }
        continue;
      }
      if (result.totalChunks === 0) {
        if (existingHashes.size > 0) {
          await deleteRepoChunksForPath(repoKey, relativePath);
        }
        continue;
      }
      if (result.chunks.length > 0) {
        await upsertRepoChunks(result.chunks);
      }
      await cleanupRepoChunks(repoKey, relativePath, result.totalChunks - 1);
      if (result.chunks.length > 0) {
        logger.info("Indexed file", {
          path: relativePath,
          changedChunks: result.chunks.length,
          totalChunks: result.totalChunks,
        });
      }
    } catch (error) {
      logger.warn("Failed to index file", {
        filePath,
        error: String(error),
      });
    }
  }

  const missingPaths = existingPaths.filter((storedPath) => !currentPaths.has(storedPath));
  for (const missingPath of missingPaths) {
    await deleteRepoChunksForPath(repoKey, missingPath);
  }
  if (missingPaths.length > 0) {
    logger.info("Removed missing files from index", {
      removed: missingPaths.length,
    });
  }

  if (headSha) {
    await setRepoIndexState(repoKey, headSha);
  }
  logger.info("Repo indexing complete");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  indexRepository().catch((error) => {
    logger.error("Repo indexing failed", { error: String(error) });
    process.exit(1);
  });
}
