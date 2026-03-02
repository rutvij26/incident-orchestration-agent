import { getConfig } from "./config.js";
import { logger } from "./logger.js";
import { createEmbeddingConnector } from "../connectors/registry.js";

type EmbeddingProvider = "auto" | "openai" | "gemini" | "none";

function resolveEmbeddingProvider(
  provider: EmbeddingProvider,
  openaiKey?: string,
  geminiKey?: string,
): { provider: "openai" | "gemini"; model: string } | null {
  if (provider === "none") {
    return null;
  }
  if (provider === "openai") {
    return openaiKey
      ? { provider: "openai", model: getConfig().EMBEDDING_MODEL }
      : null;
  }
  if (provider === "gemini") {
    return geminiKey
      ? { provider: "gemini", model: getConfig().EMBEDDING_MODEL }
      : null;
  }
  if (openaiKey) {
    return { provider: "openai", model: getConfig().EMBEDDING_MODEL };
  }
  if (geminiKey) {
    return { provider: "gemini", model: getConfig().EMBEDDING_MODEL };
  }
  return null;
}

export async function embedText(text: string): Promise<number[] | null> {
  const config = getConfig();
  const resolved = resolveEmbeddingProvider(
    config.EMBEDDING_PROVIDER,
    config.OPENAI_API_KEY,
    config.GEMINI_API_KEY,
  );

  if (!resolved) {
    logger.warn("Embedding skipped (no provider/api key configured)");
    return null;
  }

  const connector = createEmbeddingConnector(resolved, config);
  return connector.embed(text);
}

export const __test__ = {
  resolveEmbeddingProvider,
};
