import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getConfig } from "./config.js";
import { logger } from "./logger.js";

type EmbeddingProvider = "auto" | "openai" | "gemini" | "none";

let openaiClient: OpenAI | null = null;
let geminiClient: GoogleGenerativeAI | null = null;

function resolveEmbeddingProvider(
  provider: EmbeddingProvider,
  openaiKey?: string,
  geminiKey?: string
): { provider: "openai" | "gemini"; model: string } | null {
  if (provider === "none") {
    return null;
  }
  if (provider === "openai") {
    return openaiKey ? { provider: "openai", model: getConfig().EMBEDDING_MODEL } : null;
  }
  if (provider === "gemini") {
    return geminiKey ? { provider: "gemini", model: getConfig().EMBEDDING_MODEL } : null;
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
    config.GEMINI_API_KEY
  );

  if (!resolved) {
    logger.warn("Embedding skipped (no provider/api key configured)");
    return null;
  }

  if (resolved.provider === "openai") {
    if (!openaiClient) {
      openaiClient = new OpenAI({ apiKey: config.OPENAI_API_KEY });
    }
    const response = await openaiClient.embeddings.create({
      model: resolved.model,
      input: text,
    });
    const embedding = response.data[0]?.embedding;
    if (!embedding) {
      throw new Error("OpenAI embedding response missing data");
    }
    if (embedding.length !== config.EMBEDDING_DIM) {
      throw new Error(
        `Embedding dim mismatch: expected ${config.EMBEDDING_DIM}, got ${embedding.length}`
      );
    }
    return embedding;
  }

  if (!geminiClient) {
    geminiClient = new GoogleGenerativeAI(config.GEMINI_API_KEY ?? "");
  }
  const model = geminiClient.getGenerativeModel({ model: resolved.model });
  const response = await model.embedContent(text);
  const embedding = response.embedding?.values;
  if (!embedding) {
    throw new Error("Gemini embedding response missing data");
  }
  if (embedding.length !== config.EMBEDDING_DIM) {
    throw new Error(
      `Embedding dim mismatch: expected ${config.EMBEDDING_DIM}, got ${embedding.length}`
    );
  }
  return embedding;
}

export const __test__ = {
  resolveEmbeddingProvider,
};
