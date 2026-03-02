import OpenAI from "openai";
import type { EmbeddingConnector } from "./interface.js";

let client: OpenAI | null = null;

export class OpenAIEmbeddingConnector implements EmbeddingConnector {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly dim: number,
  ) {}

  async embed(text: string): Promise<number[]> {
    if (!client) {
      client = new OpenAI({ apiKey: this.apiKey });
    }
    const response = await client.embeddings.create({
      model: this.model,
      input: text,
    });
    const embedding = response.data[0]?.embedding;
    if (!embedding) {
      throw new Error("OpenAI embedding response missing data");
    }
    if (embedding.length !== this.dim) {
      throw new Error(
        `Embedding dim mismatch: expected ${this.dim}, got ${embedding.length}`,
      );
    }
    return embedding;
  }
}
