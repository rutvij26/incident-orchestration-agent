import type { Config } from "../lib/config.js";
import { logger } from "../lib/logger.js";
import { OpenAILlmConnector } from "./llm/openai.js";
import { AnthropicLlmConnector } from "./llm/anthropic.js";
import { GeminiLlmConnector } from "./llm/gemini.js";
import { OpenAIEmbeddingConnector } from "./embedding/openai.js";
import { GeminiEmbeddingConnector } from "./embedding/gemini.js";
import { LokiSourceConnector } from "./source/loki.js";
import type { SourceConnector, LogEvent } from "./source/interface.js";

export type { LlmConnector } from "./llm/interface.js";
export type { EmbeddingConnector } from "./embedding/interface.js";
export type { SourceConnector, LogEvent };

// ─── LLM connectors ──────────────────────────────────────────────────────────

/**
 * Creates an LlmConnector for an already-resolved `{ provider, model }` pair.
 * Used by `lib/llm.ts` to delegate the actual SDK call.
 */
export function createLlmConnector(
  resolved: { provider: "openai" | "anthropic" | "gemini"; model: string },
  config: Config,
): import("./llm/interface.js").LlmConnector {
  if (resolved.provider === "openai") {
    return new OpenAILlmConnector(config.OPENAI_API_KEY ?? "", resolved.model);
  }
  if (resolved.provider === "anthropic") {
    return new AnthropicLlmConnector(
      config.ANTHROPIC_API_KEY ?? "",
      resolved.model,
    );
  }
  return new GeminiLlmConnector(config.GEMINI_API_KEY ?? "", resolved.model);
}

/**
 * Resolves the full ordered list of LLM connectors from config.
 * Reads `LLM_CONNECTORS` (new, comma-separated) first; falls back to
 * `LLM_PROVIDER` (legacy) for backward compatibility.
 *
 * The returned list is ordered: first = primary, rest = fallbacks.
 * Use with `withFallback()`.
 */
export function resolveLlmConnectors(
  config: Config,
): import("./llm/interface.js").LlmConnector[] {
  const raw = config.LLM_CONNECTORS?.trim() || config.LLM_PROVIDER;
  const names =
    raw === "auto"
      ? ["openai", "anthropic", "gemini"]
      : raw.split(",").map((s) => s.trim()).filter(Boolean);

  return names.flatMap((name): import("./llm/interface.js").LlmConnector[] => {
    if (name === "openai" && config.OPENAI_API_KEY) {
      return [new OpenAILlmConnector(config.OPENAI_API_KEY, config.OPENAI_MODEL)];
    }
    if (name === "anthropic" && config.ANTHROPIC_API_KEY) {
      return [
        new AnthropicLlmConnector(
          config.ANTHROPIC_API_KEY,
          config.ANTHROPIC_MODEL,
        ),
      ];
    }
    if (name === "gemini" && config.GEMINI_API_KEY) {
      return [new GeminiLlmConnector(config.GEMINI_API_KEY, config.GEMINI_MODEL)];
    }
    return [];
  });
}

// ─── Embedding connectors ────────────────────────────────────────────────────

/**
 * Creates an EmbeddingConnector for an already-resolved `{ provider, model }` pair.
 * Used by `lib/embeddings.ts` to delegate the actual SDK call.
 */
export function createEmbeddingConnector(
  resolved: { provider: "openai" | "gemini"; model: string },
  config: Config,
): import("./embedding/interface.js").EmbeddingConnector {
  if (resolved.provider === "openai") {
    return new OpenAIEmbeddingConnector(
      config.OPENAI_API_KEY ?? "",
      resolved.model,
      config.EMBEDDING_DIM,
    );
  }
  return new GeminiEmbeddingConnector(
    config.GEMINI_API_KEY ?? "",
    resolved.model,
    config.EMBEDDING_DIM,
  );
}

/**
 * Resolves the single active EmbeddingConnector from config.
 * Reads `EMBEDDING_CONNECTOR` (new) first; falls back to `EMBEDDING_PROVIDER`.
 */
export function resolveEmbeddingConnector(
  config: Config,
): import("./embedding/interface.js").EmbeddingConnector | null {
  const raw =
    config.EMBEDDING_CONNECTOR?.trim() || config.EMBEDDING_PROVIDER;
  if (raw === "none") return null;
  if (raw === "openai" && config.OPENAI_API_KEY) {
    return new OpenAIEmbeddingConnector(
      config.OPENAI_API_KEY,
      config.EMBEDDING_MODEL,
      config.EMBEDDING_DIM,
    );
  }
  if (raw === "gemini" && config.GEMINI_API_KEY) {
    return new GeminiEmbeddingConnector(
      config.GEMINI_API_KEY,
      config.EMBEDDING_MODEL,
      config.EMBEDDING_DIM,
    );
  }
  if (raw === "auto") {
    if (config.OPENAI_API_KEY) {
      return new OpenAIEmbeddingConnector(
        config.OPENAI_API_KEY,
        config.EMBEDDING_MODEL,
        config.EMBEDDING_DIM,
      );
    }
    if (config.GEMINI_API_KEY) {
      return new GeminiEmbeddingConnector(
        config.GEMINI_API_KEY,
        config.EMBEDDING_MODEL,
        config.EMBEDDING_DIM,
      );
    }
  }
  return null;
}

// ─── Source connectors ───────────────────────────────────────────────────────

/**
 * Resolves the active list of SourceConnectors from config.
 * Reads `SOURCE_CONNECTORS` (comma-separated). Defaults to `"loki"`.
 *
 * Each named connector is only included when its required configuration is
 * present. Multiple connectors are queried in parallel via `aggregateLogs()`.
 */
export function resolveSourceConnectors(config: Config): SourceConnector[] {
  const names = config.SOURCE_CONNECTORS.split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return names.flatMap((name): SourceConnector[] => {
    if (name === "loki") {
      return [new LokiSourceConnector(config.LOKI_URL, config.LOKI_QUERY)];
    }
    logger.warn(`resolveSourceConnectors: unknown connector "${name}", skipping`);
    return [];
  });
}

// ─── Multi-connector helpers ──────────────────────────────────────────────────

/**
 * Parallel fire-and-forget: calls every handler with `event`.
 * Individual failures are swallowed so one failing connector never blocks others.
 * Intended for notifications and issue creation where fan-out semantics apply.
 */
export async function fanOut<T>(
  handlers: Array<(event: T) => Promise<void>>,
  event: T,
): Promise<void> {
  await Promise.allSettled(handlers.map((h) => h(event)));
}

/**
 * Fallback chain: tries connectors in order, returns the first success.
 * Logs a warning and advances to the next connector on any error.
 * Intended for LLM calls where a secondary provider is a valid fallback.
 */
export async function withFallback<C, T>(
  connectors: C[],
  call: (c: C) => Promise<T>,
): Promise<T> {
  if (connectors.length === 0) {
    throw new Error("withFallback: no connectors provided");
  }
  let lastError: unknown;
  for (let i = 0; i < connectors.length; i++) {
    try {
      return await call(connectors[i]);
    } catch (error) {
      lastError = error;
      if (i < connectors.length - 1) {
        logger.warn("LLM connector failed, trying next", {
          index: i,
          error: String(error),
        });
      }
    }
  }
  throw lastError;
}

/**
 * Parallel log aggregation: queries all source connectors concurrently,
 * merges results, and deduplicates by `(timestamp, message)`.
 * Connector failures are silently skipped so one bad source never blocks others.
 */
export async function aggregateLogs(
  connectors: SourceConnector[],
  opts: { start: Date; end: Date; limit: number },
): Promise<LogEvent[]> {
  if (connectors.length === 0) return [];
  const settled = await Promise.allSettled(
    connectors.map((c) => c.fetchLogs(opts)),
  );
  const all: LogEvent[] = [];
  for (const result of settled) {
    if (result.status === "fulfilled") {
      all.push(...result.value);
    }
  }
  const seen = new Set<string>();
  return all.filter((e) => {
    const key = `${e.timestamp}:${e.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
