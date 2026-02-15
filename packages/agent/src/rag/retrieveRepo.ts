import { getConfig } from "../lib/config.js";
import { logger } from "../lib/logger.js";
import { embedText } from "../lib/embeddings.js";
import {
  initRepoMemory,
  searchRepoChunks,
  RepoSearchResult,
} from "../memory/repo.js";

export async function retrieveRepoContext(
  query: string
): Promise<RepoSearchResult[]> {
  const config = getConfig();
  await initRepoMemory();
  const embedding = await embedText(query);
  if (!embedding) {
    logger.warn("Repo retrieval skipped (no embedding configured)");
    return [];
  }
  return searchRepoChunks(embedding, config.RAG_TOP_K);
}
