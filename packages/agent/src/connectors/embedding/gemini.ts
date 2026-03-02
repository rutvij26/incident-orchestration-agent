import { GoogleGenerativeAI } from "@google/generative-ai";
import type { EmbeddingConnector } from "./interface.js";

let client: GoogleGenerativeAI | null = null;

export class GeminiEmbeddingConnector implements EmbeddingConnector {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly dim: number,
  ) {}

  async embed(text: string): Promise<number[]> {
    if (!client) {
      /* v8 ignore next - GEMINI_API_KEY is always set when Gemini provider is active */
      client = new GoogleGenerativeAI(this.apiKey);
    }
    const model = client.getGenerativeModel({ model: this.model });
    const response = await model.embedContent(text);
    const embedding = response.embedding?.values;
    if (!embedding) {
      throw new Error("Gemini embedding response missing data");
    }
    if (embedding.length !== this.dim) {
      throw new Error(
        `Embedding dim mismatch: expected ${this.dim}, got ${embedding.length}`,
      );
    }
    return embedding;
  }
}
