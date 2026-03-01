import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";

const mockEmbeddingsCreate = vi.fn();
const mockEmbedContent = vi.fn();

vi.mock("openai", () => ({
  default: class {
    embeddings = { create: mockEmbeddingsCreate };
  },
}));

vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel() {
      return { embedContent: mockEmbedContent };
    }
  },
}));

vi.mock("./config.js", () => ({ getConfig: vi.fn() }));
vi.mock("./logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { embedText, __test__ } from "./embeddings.js";
import { getConfig } from "./config.js";

const baseConfig = {
  EMBEDDING_MODEL: "text-embedding-3-small",
  EMBEDDING_DIM: 3,
};

afterEach(() => vi.clearAllMocks());

describe("resolveEmbeddingProvider", () => {
  beforeEach(() => {
    vi.mocked(getConfig).mockReturnValue({
      ...baseConfig,
      EMBEDDING_MODEL: "my-model",
    } as any);
  });

  it("returns null for provider=none", () => {
    expect(__test__.resolveEmbeddingProvider("none")).toBeNull();
  });

  it("returns openai when key provided", () => {
    expect(__test__.resolveEmbeddingProvider("openai", "key")).toEqual({
      provider: "openai",
      model: "my-model",
    });
  });

  it("returns null for openai when key missing", () => {
    expect(__test__.resolveEmbeddingProvider("openai")).toBeNull();
  });

  it("returns gemini when key provided", () => {
    expect(__test__.resolveEmbeddingProvider("gemini", undefined, "gkey")).toEqual({
      provider: "gemini",
      model: "my-model",
    });
  });

  it("returns null for gemini when key missing", () => {
    expect(__test__.resolveEmbeddingProvider("gemini")).toBeNull();
  });

  it("auto-selects openai when openai key available", () => {
    expect(__test__.resolveEmbeddingProvider("auto", "ok")).toEqual({
      provider: "openai",
      model: "my-model",
    });
  });

  it("auto-selects gemini when only gemini key available", () => {
    expect(__test__.resolveEmbeddingProvider("auto", undefined, "gkey")).toEqual({
      provider: "gemini",
      model: "my-model",
    });
  });

  it("returns null when auto and no keys", () => {
    expect(__test__.resolveEmbeddingProvider("auto")).toBeNull();
  });
});

describe("embedText", () => {
  it("returns null and warns when no provider configured", async () => {
    vi.mocked(getConfig).mockReturnValue({
      ...baseConfig,
      EMBEDDING_PROVIDER: "none",
      OPENAI_API_KEY: undefined,
      GEMINI_API_KEY: undefined,
    } as any);
    const result = await embedText("hello");
    expect(result).toBeNull();
  });

  it("returns embedding vector from OpenAI", async () => {
    vi.mocked(getConfig).mockReturnValue({
      ...baseConfig,
      EMBEDDING_PROVIDER: "openai",
      OPENAI_API_KEY: "key",
    } as any);
    mockEmbeddingsCreate.mockResolvedValue({
      data: [{ embedding: [0.1, 0.2, 0.3] }],
    });
    expect(await embedText("hello")).toEqual([0.1, 0.2, 0.3]);
  });

  it("throws when OpenAI returns no embedding data", async () => {
    vi.mocked(getConfig).mockReturnValue({
      ...baseConfig,
      EMBEDDING_PROVIDER: "openai",
      OPENAI_API_KEY: "key",
    } as any);
    mockEmbeddingsCreate.mockResolvedValue({ data: [] });
    await expect(embedText("hello")).rejects.toThrow("missing data");
  });

  it("throws on OpenAI embedding dimension mismatch", async () => {
    vi.mocked(getConfig).mockReturnValue({
      ...baseConfig,
      EMBEDDING_PROVIDER: "openai",
      OPENAI_API_KEY: "key",
      EMBEDDING_DIM: 5,
    } as any);
    mockEmbeddingsCreate.mockResolvedValue({
      data: [{ embedding: [0.1, 0.2, 0.3] }],
    });
    await expect(embedText("hello")).rejects.toThrow("dim mismatch");
  });

  it("returns embedding vector from Gemini", async () => {
    vi.mocked(getConfig).mockReturnValue({
      ...baseConfig,
      EMBEDDING_PROVIDER: "gemini",
      GEMINI_API_KEY: "gkey",
    } as any);
    mockEmbedContent.mockResolvedValue({
      embedding: { values: [0.4, 0.5, 0.6] },
    });
    expect(await embedText("test")).toEqual([0.4, 0.5, 0.6]);
  });

  it("throws when Gemini returns no embedding data", async () => {
    vi.mocked(getConfig).mockReturnValue({
      ...baseConfig,
      EMBEDDING_PROVIDER: "gemini",
      GEMINI_API_KEY: "gkey",
    } as any);
    mockEmbedContent.mockResolvedValue({ embedding: null });
    await expect(embedText("test")).rejects.toThrow("missing data");
  });

  it("throws on Gemini embedding dimension mismatch", async () => {
    vi.mocked(getConfig).mockReturnValue({
      ...baseConfig,
      EMBEDDING_PROVIDER: "gemini",
      GEMINI_API_KEY: "gkey",
      EMBEDDING_DIM: 10,
    } as any);
    mockEmbedContent.mockResolvedValue({
      embedding: { values: [0.1, 0.2, 0.3] },
    });
    await expect(embedText("test")).rejects.toThrow("dim mismatch");
  });
});
