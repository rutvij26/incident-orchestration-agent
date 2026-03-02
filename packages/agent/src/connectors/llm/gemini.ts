import { GoogleGenerativeAI } from "@google/generative-ai";
import type { LlmConnector } from "./interface.js";

let client: GoogleGenerativeAI | null = null;

export class GeminiLlmConnector implements LlmConnector {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async complete(
    prompt: string,
    _opts: { maxTokens: number; temperature: number },
  ): Promise<string> {
    if (!client) {
      /* v8 ignore next */
      client = new GoogleGenerativeAI(this.apiKey);
    }
    const model = client.getGenerativeModel({ model: this.model });
    const response = await model.generateContent(prompt);
    return response.response.text();
  }
}
